// The detail of one case as a table on the board: for every step it passes,
// the choice taken, its setup, test data and expected result. The rows and the copy
// text come from core/testSteps.ts; this file draws them.

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow } from "./core/flow";
import { scenarioRows, scenariosToTsv, STEP_COLUMNS, type ScenarioItem } from "./core/testSteps";

const COL_W = [44, 190, 170, 230, 320, 320];
const COLS: { key: string; title: string; w: number }[] = STEP_COLUMNS.map((c, i) => ({ ...c, w: COL_W[i] }));
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
function tablesHtml(scenarios: ScenarioItem[]): string {
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
        '<!doctype html><html><head><meta charset="utf-8"><style>' +
        "body{margin:0;padding:12px;font:13px/1.45 system-ui,'Segoe UI',sans-serif;color:#1d2127;background:#fff;overflow:hidden}" +
        "h3{margin:18px 0 6px;font-size:14px}h3:first-child{margin-top:0}" +
        "table{border-collapse:collapse;width:100%;table-layout:fixed}" +
        "th,td{box-sizing:border-box;border:1px solid #c9ccd2;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}" +
        "th{background:#eceef1;font-weight:600}" +
        "</style></head><body>" +
        body +
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
}): { frameId: string; elements: DrawdyElementSchema[]; width: number; height: number } {
    const { scenarios, name, origin, generateId } = opts;
    const [ox, oy] = origin;
    const frameId = generateId();
    const tsv = scenariosToTsv(scenarios); // kept on the table, so "copy" can read it from a selection
    const tableW = COLS.reduce((a, c) => a + c.w, 0);
    // The page is laid out by the browser and a board page cannot report its height back,
    // so the height is worked out from the same widths and fonts (a few percent of slack).
    const LINE = 18.9; // 13px * 1.45
    let inner = 24; // body padding
    scenarios.forEach((cs, k) => {
        inner += (k ? 18 : 0) + 20 + 6 + (12 + LINE + 1); // title, space, header row
        for (const r of scenarioRows(cs.flow))
            inner += 12 + 1 + LINE * Math.max(...COLS.map((c) => linesIn(r[c.key] ?? "", c.w)));
    });
    const frameW = tableW + 80 + 24;
    const compW = tableW + 24;
    const compH = Math.min(MAX_H, Math.round(inner * 1.03) + 24);
    const frameH = compH + 80;
    const elements: DrawdyElementSchema[] = [
        {
            type: "frame",
            drawdyElementId: frameId,
            name,
            position: [ox, oy],
            width: frameW,
            height: frameH,
            rotation: 0,
            meta: { e2eScenarioTable: true, scenarios: scenarios.length, tsv },
        },
        {
            type: "component",
            drawdyElementId: generateId(),
            frameId,
            // a component is placed in board coordinates, not relative to its frame
            x: ox + 40,
            y: oy + 50,
            width: compW,
            height: compH,
            meta: { e2eScenarioTable: true, scenarios: scenarios.length, tsv },
            schema: {
                type: "iframe",
                label: name,
                child: { srcDoc: tablesHtml(scenarios) },
                styles: { width: [compW, "px"], height: [compH, "px"] },
            },
        } as DrawdyElementSchema,
    ];
    return { frameId, elements, width: frameW, height: frameH };
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
