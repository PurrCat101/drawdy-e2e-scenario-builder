// The detail of one case as a table on the board: for every step it passes,
// the choice taken, its setup, test data and expected result. The rows and the copy
// text come from core/testSteps.ts; this file draws them.

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { themeCss } from "./webview";
import type { Flow } from "./core/flow";
import { flowStepRows, flowStepsToTsv, scenarioRows, scenariosToTsv, STEP_COLUMNS, STEPS_LIST_COLUMNS, type ScenarioItem } from "./core/testSteps";

const COL_W = [44, 190, 170, 230, 320, 320];
type Col = { key: string; title: string; w: number };
const COLS_SCENARIO: Col[] = STEP_COLUMNS.map((c, i) => ({ ...c, w: COL_W[i] }));
/** The steps list of a whole flow: those columns and Req (requirement IDs). */
const LIST_COLS: Col[] = STEPS_LIST_COLUMNS.map((c, i) => ({ ...c, w: i < COL_W.length ? COL_W[i] : 130 }));
/** The Test steps table: one table for all scenarios, so a Scenario column comes first. */
const TEST_COLS: Col[] = [{ key: "id", title: "Scenario", w: 120 }, ...COLS_SCENARIO];
/** Height of the tabs and arrows above a Test steps scenario (their row and gap). */
const TOOLBAR_H = 44;
const FONT = 12;
const MAX_H = 200000; // the board cannot scroll an embedded page, so a table is drawn full height
const CHAR_W = 7.6; // approx width of a character at FONT
const LINE_H = 17;
const PAD = 10;
const HEAD_H = 36;

/** Width of a text in the table's font (13px): Thai letters are narrower than Latin ones. */
function textWidth(t: string): number {
    let w = 0;
    for (const ch of t) w += /[\u0E00-\u0E7F]/.test(ch) ? 5.9 : /[A-Z0-9]/.test(ch) ? 8 : 6.9;
    return w;
}

/** How many lines a text takes in a column `w` wide (cell padding 8 + 8, border 1). */
function linesIn(text: string, w: number): number {
    const room = w - 17;
    return text
        .split("\n")
        .reduce((n, l) => n + Math.max(1, Math.ceil((textWidth(l) * 0.97) / room)), 0);
}

const esc = (x: string) =>
    x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The tables as one HTML page: real table cells, so rows size themselves. */
function tablesHtml(scenarios: ScenarioItem[], COLS: Col[]): string {
    const head = COLS.map((c) => `<th style="width:${c.w}px">${esc(c.title)}</th>`).join("");
    const body = scenarios
        .map((cs) => {
            const rows = scenarioRows(cs.flow)
                .map(
                    (r) =>
                        "<tr>" +
                        COLS.map((c) => `<td>${esc(r[c.key] ?? "").replace(/\n/g, "<br>")}</td>`).join("") +
                        "</tr>"
                )
                .join("");
            return (
                `<h3>${esc(cs.title)}</h3>` +
                `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`
            );
        })
        .join("");
    return (
        '<!doctype html><html><head><meta charset="utf-8"><style>' + themeCss() +
        "body{margin:0;padding:12px;font:13px/1.45 system-ui,'Segoe UI',sans-serif;color:var(--dd-text-primary,#1d2127);background:var(--dd-surface-panel,#fff);overflow:hidden}" +
        "h3{margin:18px 0 6px;font-size:14px}h3:first-child{margin-top:0}" +
        "table{border-collapse:collapse;width:100%;table-layout:fixed}" +
        "th,td{box-sizing:border-box;border:1px solid var(--dd-border-medium,#c9ccd2);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}" +
        "th{background:var(--dd-control-surface,#eceef1);font-weight:600}" +
        "</style></head><body>" +
        body +
        "</body></html>"
    );
}

/** The scenario's ID: the part of its title before the first " · " (OUT-30). */
const idOf = (title: string) => title.split(" · ")[0];
/** Happy or Negative, read from the title's second part (OUT-30). */
const kindOf = (title: string): "happy" | "negative" => (title.split(" · ")[1] === "Negative" ? "negative" : "happy");

/** The Test steps page's script: Happy/Negative tabs and previous/next, one scenario shown at a time. */
const PAGE_SCRIPT = `(function(){
var secs=[].slice.call(document.querySelectorAll('section'));
var tabs=[].slice.call(document.querySelectorAll('#tabs button'));
var prev=document.getElementById('prev'),next=document.getElementById('next'),pos=document.getElementById('pos'),q=document.getElementById('q');
var kind='happy',i=0,hits=null;
function group(k){return secs.filter(function(s){return s.getAttribute('data-kind')===k;});}
function list(){return hits?hits:group(kind);}
function show(){
  var g=list();
  if(i>=g.length)i=Math.max(0,g.length-1);
  if(i<0)i=0;
  secs.forEach(function(s){s.hidden=true;});
  if(g.length){g[i].hidden=false;if(hits)kind=g[i].getAttribute('data-kind');}
  tabs.forEach(function(b){
    var k=b.getAttribute('data-kind');
    b.setAttribute('aria-pressed',k===kind?'true':'false');
    b.disabled=group(k).length===0;
  });
  prev.disabled=i<=0;
  next.disabled=i>=g.length-1;
  if(!g.length)pos.textContent=hits?'No match':'No scenarios';
  else pos.textContent=g[i].getAttribute('data-id')+' \\u00b7 '+(i+1)+' of '+g.length+(hits?' found':'');
}
tabs.forEach(function(b){b.addEventListener('click',function(){q.value='';hits=null;kind=b.getAttribute('data-kind');i=0;show();});});
prev.addEventListener('click',function(){i--;show();});
next.addEventListener('click',function(){i++;show();});
q.addEventListener('input',function(){
  var t=q.value.trim().toLowerCase();
  hits=t?secs.filter(function(s){return s.getAttribute('data-text').indexOf(t)>=0;}):null;
  i=0;show();
});
q.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&hits&&hits.length){i=(i+1)%hits.length;show();}
});
if(!group(kind).length&&group('negative').length)kind='negative';
show();
})();`;

/**
 * The Test steps page: one scenario at a time. A tab row picks Happy or Negative, and
 * the arrows step through that kind's scenarios (OUT-33). Each scenario is its own table
 * with the Scenario column first. The page has its own script; it reads nothing from the board.
 */
function testStepsHtml(scenarios: ScenarioItem[]): string {
    const head = TEST_COLS.map((c) => `<th style="width:${c.w}px">${esc(c.title)}</th>`).join("");
    const count = (k: "happy" | "negative") => scenarios.filter((cs) => kindOf(cs.title) === k).length;
    const sections = scenarios
        .map((cs) => {
            const id = idOf(cs.title);
            // what the search box looks through: every cell of every row, in lower case
            const textOf = scenarioRows(cs.flow)
                .map((r) => TEST_COLS.map((c) => (c.key === "id" ? id : r[c.key] ?? "")).join(" "))
                .join(" ")
                .toLowerCase();
            const rows = scenarioRows(cs.flow)
                .map((r) => {
                    const row: Record<string, string> = { ...r, id };
                    return (
                        "<tr>" +
                        TEST_COLS.map((c) => `<td>${esc(row[c.key] ?? "").replace(/\n/g, "<br>")}</td>`).join("") +
                        "</tr>"
                    );
                })
                .join("");
            return (
                `<section data-kind="${kindOf(cs.title)}" data-id="${esc(id)}" data-text="${esc(textOf)}" hidden>` +
                `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></section>`
            );
        })
        .join("");
    const bar =
        '<div id="bar"><div id="tabs">' +
        `<button data-kind="happy">Happy (${count("happy")})</button>` +
        `<button data-kind="negative">Negative (${count("negative")})</button>` +
        '</div><input id="q" type="search" placeholder="Find ID or text" aria-label="Find a scenario"><div id="pager"><button id="prev" aria-label="Previous scenario">&#8249;</button>' +
        '<span id="pos"></span><button id="next" aria-label="Next scenario">&#8250;</button></div></div>';
    return (
        '<!doctype html><html><head><meta charset="utf-8"><style>' + themeCss() +
        "body{margin:0;padding:12px;font:13px/1.45 system-ui,'Segoe UI',sans-serif;color:var(--dd-text-primary,#1d2127);background:var(--dd-surface-panel,#fff);overflow:hidden}" +
        "#bar{display:flex;align-items:center;justify-content:space-between;gap:10px;height:32px;margin-bottom:12px}" +
        "#tabs,#pager{display:flex;align-items:center;gap:6px}" +
        "#q{flex:1;min-width:0;max-width:260px;font:inherit;padding:4px 8px;border:1px solid var(--dd-border-medium,#c9ccd2);border-radius:4px}" +
        "button{font:inherit;padding:4px 10px;border:1px solid var(--dd-border-medium,#c9ccd2);border-radius:4px;background:var(--dd-control-surface,#fff);color:var(--dd-text-primary,#1d2127);cursor:pointer}" +
        "button[aria-pressed=true]{background:var(--dd-accent,#1d2127);color:var(--dd-on-accent,#fff);border-color:var(--dd-accent,#1d2127)}" +
        "button:disabled{opacity:.4;cursor:default}" +
        "#pos{min-width:120px;text-align:center;color:var(--dd-text-secondary,#5b616b);white-space:nowrap}" +
        "table{border-collapse:collapse;width:100%;table-layout:fixed}" +
        "th,td{box-sizing:border-box;border:1px solid var(--dd-border-medium,#c9ccd2);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}" +
        "th{background:var(--dd-control-surface,#eceef1);font-weight:600}" +
        "</style></head><body>" +
        bar +
        sections +
        `<script>${PAGE_SCRIPT}</script>` +
        "</body></html>"
    );
}

/**
 * One frame holding a table per case, as a single embedded page (real HTML
 * tables), each case under its own title.
 */
export function renderScenarioTables(opts: {
    scenarios: ScenarioItem[];
    name: string;
    origin: [number, number];
    generateId: () => string;
    /** a steps list of whole flows (one table per flow, with Req) instead of the tables of scenarios */
    stepsList?: boolean;
}): { frameId: string; elements: DrawdyElementSchema[]; width: number; height: number } {
    const { scenarios, name, origin, generateId } = opts;
    const COLS = opts.stepsList ? LIST_COLS : TEST_COLS;
    const [ox, oy] = origin;
    // kept on the table, so "copy" can read it from a selection
    const tsv = opts.stepsList ? scenarios.map((cs) => flowStepsToTsv(cs.flow)).join("\n\n") : scenariosToTsv(scenarios);
    // what a copy says it copied: scenarios, or the steps of a steps list
    const count = opts.stepsList ? scenarios.reduce((a, cs) => a + flowStepRows(cs.flow).length, 0) : scenarios.length;
    const tableW = COLS.reduce((a, c) => a + c.w, 0);
    // The page is laid out by the browser and a board page cannot report its height back,
    // so the height is worked out from the same widths and fonts (a few percent of slack).
    const LINE = 18.9; // 13px * 1.45
    let inner = 24; // body padding
    if (opts.stepsList) {
        scenarios.forEach((cs, k) => {
            inner += (k ? 18 : 0) + 20 + 6 + (12 + LINE + 1); // title, space, header row
            for (const r of scenarioRows(cs.flow))
                inner += 12 + 1 + LINE * Math.max(...COLS.map((c) => linesIn(r[c.key] ?? "", c.w)));
        });
    } else {
        // one scenario at a time: the bar, a header row, and the tallest scenario sets the height
        let tallest = 0;
        for (const cs of scenarios) {
            let h = 0;
            for (const r of scenarioRows(cs.flow)) {
                const row: Record<string, string> = { ...r, id: idOf(cs.title) };
                h += 12 + 1 + LINE * Math.max(...COLS.map((c) => linesIn(row[c.key] ?? "", c.w)));
            }
            tallest = Math.max(tallest, h);
        }
        inner += TOOLBAR_H + (12 + LINE + 1) + tallest;
    }
    const compW = tableW + 24;
    const compH = Math.min(MAX_H, Math.round(inner * 1.03) + 24);
    const component = (x: number, y: number, id: string, parent?: string): DrawdyElementSchema =>
        ({
            type: "component",
            drawdyElementId: id,
            ...(parent ? { frameId: parent } : {}),
            // a component is placed in board coordinates
            x,
            y,
            width: compW,
            height: compH,
            meta: { e2eScenarioTable: true, scenarios: scenarios.length, tsv, ...(opts.stepsList ? { count, unit: "steps" } : {}) },
            schema: {
                type: "iframe",
                label: name,
                child: { srcDoc: opts.stepsList ? tablesHtml(scenarios, COLS) : testStepsHtml(scenarios) },
                styles: { width: [compW, "px"], height: [compH, "px"] },
            },
        }) as DrawdyElementSchema;
    // A table (Test steps and the steps list) is the iframe alone: a frame around it would own the
    // elements inside it, and its embedded page would then not take clicks (see specs OUT-30, OUT-67).
    const id = generateId();
    return { frameId: id, elements: [component(ox, oy, id)], width: compW, height: compH };
}

export function renderScenarioTable(opts: {
    flow: Flow;
    title: string;
    origin: [number, number];
    generateId: () => string;
}) {
    return renderScenarioTables({
        scenarios: [{ title: opts.title, flow: opts.flow }],
        name: opts.title,
        origin: opts.origin,
        generateId: opts.generateId,
    });
}
