// The interactive decision table (OUT-70): one page in an iframe, the same table as the
// boxes of OUT-60, for All, Pair and Each at once (switched with the buttons on top). The
// first two columns and the heads stay in view while it scrolls sideways; the scrollbar is
// on top. Clicking a condition or a choice filters the columns to the scenarios that take
// it; a second click, or Show all, clears it. The page uses Drawdy's theme colours (OUT-71)
// and loads nothing from outside.

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { decisionToTsv, type DecisionTable } from "./core/decisionTable";
import { fitHeight } from "./textBox";
import { themeCss } from "./webview";

const LABEL_W = 180;
const COMBO_W = 230;
const COL_W = 88;
/** at least this many scenario columns show without scrolling (the page's default width) */
const MIN_COLS = 8;
/** a 23-inch screen shows about 20 columns at once; more scroll sideways */
const MAX_COLS = 20;
/** a mode with more scenarios than this is not put in the page (its button says so) */
export const MAX_PAGE_SCENARIOS = 1000;
const FONT = 13;
/** the smallest height of a value row */
const ROW_MIN = 34;
const TOP_H = 44;
const HS_H = 18; // the scrollbar on top
const BAR_H = 28;
const HEAD_H = 36;

export type PageMode = "all" | "pair" | "min";
/** One mode of the page: its count, and its table (null when it is too big for the page). */
export type PageModeTable = { mode: PageMode; count: number; table: DecisionTable | null };

const NAME: Record<PageMode, string> = { all: "All", pair: "Pair", min: "Each" };
const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The height of every row, worked out from its text (OUT-70): a value row is as tall as its
 * label needs, and a condition is as tall as its rows, or as its name if that is taller
 * (the last row takes the rest). The page and the table use the same numbers.
 */
export function layoutRows(t: DecisionTable): { rows: number[][]; total: number } {
    const rows = t.conditions.map((cd, ci) => {
        const count = Math.max(1, t.marks[ci].length);
        const hs = Array.from({ length: count }, (_, vi) =>
            Math.max(ROW_MIN, fitHeight(cd.values[vi]?.label ?? "", COMBO_W, FONT))
        );
        const sum = hs.reduce((a, b) => a + b, 0);
        const need = fitHeight(`${cd.step + 1}. ${cd.name}`, LABEL_W, FONT);
        if (need > sum) hs[hs.length - 1] += need - sum;
        return hs;
    });
    const total = rows.reduce((s, hs) => s + hs.reduce((a, b) => a + b, 0), 0);
    return { rows, total };
}

/** One mode's table: the bars, the heads, and the rows of every condition (OUT-60 to 62). */
function tableHtml(t: DecisionTable, mode: PageMode, hidden: boolean): string {
    const n = t.columns.length;
    const happy = t.columns.flatMap((c, k) => (c.type === "happy" ? [k] : []));
    const neg = t.columns.flatMap((c, k) => (c.type === "neg" ? [k] : []));
    const cls = (k: number) => `col c${k}`;
    const bars =
        `<tr class="bar"><th class="s0"></th><th class="s1"></th>` +
        (happy.length ? `<th class="ok" colspan="${happy.length}">Success</th>` : "") +
        (neg.length ? `<th class="bad" colspan="${neg.length}">Negative</th>` : "") +
        `</tr>`;
    const heads =
        `<tr class="heads"><th class="s0">Condition</th><th class="s1">Combinations</th>` +
        t.columns
            .map((c, k) => `<th class="${cls(k)} ${c.type === "happy" ? "ok" : "bad"}" title="${esc(c.id)}">${esc(c.id)}</th>`)
            .join("") +
        `</tr>`;
    const { rows: heights } = layoutRows(t);
    let body = "";
    t.conditions.forEach((cd, ci) => {
        const count = Math.max(1, t.marks[ci].length);
        const union = new Set<number>();
        for (let vi = 0; vi < count; vi++) (t.marks[ci][vi] ?? []).forEach((on, k) => { if (on) union.add(k); });
        const condName = `${cd.step + 1}. ${cd.name}`;
        for (let vi = 0; vi < count; vi++) {
            const v = cd.values[vi];
            const marks = t.marks[ci][vi] ?? [];
            const clickable = !!v && v.id !== null;
            const valueCols = marks.flatMap((on, k) => (on ? [k] : []));
            body += `<tr style="height:${heights[ci][vi]}px">`;
            if (vi === 0)
                body += `<th class="s0 cond" data-ci="${ci}" data-key="c|${esc(condName)}" rowspan="${count}" data-cols="${[...union].join(",")}" data-label="${esc(condName)}" title="Click: the scenarios that take any choice of this step">${esc(condName)}</th>`;
            body += clickable
                ? `<td class="s1 combo click" data-ci="${ci}" data-key="v|${esc(v.label)}" data-cols="${valueCols.join(",")}" data-label="${esc(v.label)}" title="Click: the scenarios that take this choice">${esc(v.label)}</td>`
                : `<td class="s1 combo" data-ci="${ci}">${esc(v ? v.label : "")}</td>`;
            t.columns.forEach((_, k) => {
                body += marks[k] ? `<td class="${cls(k)}"><span class="mk">x</span></td>` : `<td class="${cls(k)}"></td>`;
            });
            body += "</tr>";
        }
    });
    const width = LABEL_W + COMBO_W + n * COL_W;
    // one <col> for each column, so the widths hold with the frozen columns (a filter sets one to 0)
    const cols =
        `<col style="width:${LABEL_W}px"><col style="width:${COMBO_W}px">` +
        t.columns.map(() => `<col style="width:${COL_W}px">`).join("");
    return `<table class="mt" data-mode="${mode}" data-n="${n}" style="width:${width}px"${hidden ? " hidden" : ""}>` +
        `<colgroup>${cols}</colgroup><thead>${bars}${heads}</thead><tbody>${body}</tbody></table>`;
}

/** The page's HTML: the buttons of the modes, then one table for each mode, one shown. */
export function decisionHtml(modes: PageModeTable[], active: PageMode, title: string): string {
    const tables = modes
        .map((m) => (m.table ? tableHtml(m.table, m.mode, m.mode !== active) : ""))
        .join("");
    const buttons = modes
        .map((m) => {
            const disabled = m.table ? "" : " disabled";
            const pressed = m.mode === active ? "true" : "false";
            return `<button data-mode="${m.mode}" aria-pressed="${pressed}"${disabled}>${NAME[m.mode]} <span>${m.count}</span></button>`;
        })
        .join("");
    const shown = modes.find((m) => m.mode === active);
    const note = shown && !shown.table
        ? `<div class="empty">${NAME[active]} has ${shown.count} scenarios, too many for this page (at most ${MAX_PAGE_SCENARIOS}): pick Pair or Each</div>`
        : "";
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${themeCss()}</style>
<style>
  :root { --paper: linear-gradient(var(--dd-surface-panel, #ffffff), var(--dd-surface-panel, #ffffff)); --soft: linear-gradient(var(--dd-control-surface, #f3f4f6), var(--dd-control-surface, #f3f4f6)); --okc: linear-gradient(var(--dd-accent-subtle, #f6fbd6), var(--dd-accent-subtle, #f6fbd6)); --badc: linear-gradient(var(--dd-status-danger-subtle, #fdecea), var(--dd-status-danger-subtle, #fdecea)); --hov: linear-gradient(var(--dd-interaction-hover, #e5e7eb), var(--dd-interaction-hover, #e5e7eb)); }
  html, body { margin: 0; height: 100%; background: var(--dd-surface-panel, #ffffff); color: var(--dd-text-primary, #1d2127); font: 13px/1.4 var(--dd-font-sans, system-ui, "Segoe UI", sans-serif); }
  body { display: flex; flex-direction: column; overflow: hidden; }
  .top { flex: none; display: flex; gap: 10px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--dd-border-medium, #c9ccd2); height: ${TOP_H}px; }
  .seg { display: inline-flex; border: 1px solid var(--dd-border-medium, #c9ccd2); border-radius: 999px; overflow: hidden; flex: none; }
  .seg button { border: 0; border-radius: 0; background: var(--dd-surface-panel, #ffffff); color: var(--dd-text-primary, #1d2127); }
  .seg button[aria-pressed="true"] { background: var(--dd-accent, #c8f500); color: var(--dd-on-accent, #111827); font-weight: 600; }
  .seg button span { font-weight: 400; opacity: .75; }
  #msg { flex: 1; min-width: 0; font-size: 12px; color: var(--dd-text-secondary, #5b616b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #msg b { color: var(--dd-text-primary, #1d2127); }
  button { font: inherit; font-size: 12px; font-weight: 600; border: 1px solid var(--dd-border-medium, #c9ccd2); background: var(--dd-control-surface, #f3f4f6); color: var(--dd-text-primary, #1d2127); border-radius: 16px; padding: 2px 10px; height: 28px; cursor: pointer; }
  button:hover { background: var(--dd-interaction-hover, #e5e7eb); }
  button:disabled { opacity: .45; cursor: default; }
  button[hidden] { display: none; }
  /* the scrollbar on top is the one that shows; the table's own bar is hidden and driven by it */
  #hs { flex: none; height: ${HS_H}px; overflow-x: auto; overflow-y: hidden; }
  #hs > div { height: 1px; }
  /* the bar on top does the sideways scrolling; the bar on the right shows when the rows are longer than the page */
  .wrap { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; }
  .empty { padding: 24px; color: var(--dd-text-secondary, #5b616b); }
  table { table-layout: fixed; border-collapse: separate; border-spacing: 0; }
  th, td { border-right: 1px solid var(--dd-border-medium, #c9ccd2); border-bottom: 1px solid var(--dd-border-medium, #c9ccd2); padding: 6px 8px; background: var(--paper), #ffffff; vertical-align: middle; overflow-wrap: anywhere; }
  thead th { position: sticky; top: 0; z-index: 2; text-align: center; font-weight: 600; }
  thead tr.bar th { height: ${BAR_H}px; font-size: 12px; }
  thead tr.heads th { height: ${HEAD_H}px; background: var(--soft), #f3f4f6; }
  th.ok { background: var(--okc), #ffffff; }
  th.bad { background: var(--badc), #ffffff; }
  .s0, .s1 { position: sticky; z-index: 3; }
  thead .s0, thead .s1 { z-index: 4; }
  .s0 { left: 0; width: ${LABEL_W}px; min-width: ${LABEL_W}px; max-width: ${LABEL_W}px; }
  .s1 { left: ${LABEL_W}px; width: ${COMBO_W}px; min-width: ${COMBO_W}px; max-width: ${COMBO_W}px; }
  thead .s0, thead .s1 { background: var(--soft), #f3f4f6; font-size: 12px; color: var(--dd-text-secondary, #5b616b); }
  th.cond { text-align: left; font-weight: 600; background: var(--soft), #f3f4f6; }
  td.combo { background: var(--paper), #ffffff; }
  td.click, th.cond[data-cols] { cursor: pointer; }
  td.click:hover, th.cond:hover { background: var(--hov), #e5e7eb; }
  th.cond.on, td.combo.on { background: var(--okc), #f6fbd6; box-shadow: inset 3px 0 0 var(--dd-accent, #c8f500); }
  .col { width: ${COL_W}px; min-width: ${COL_W}px; max-width: ${COL_W}px; text-align: center; }
  .mk { display: inline-block; min-width: 28px; padding: 2px 0; border-radius: 8px; background: var(--dd-status-info, #3b6fd8); color: var(--dd-on-status-info, #ffffff); font-weight: 600; line-height: 1.4; }
  .off { display: none; }
</style>
</head>
<body>
<div class="top">
  <div class="seg" role="group" aria-label="Mode">${buttons}</div>
  <div id="msg"></div>
  <button id="clear" hidden>Show all</button>
</div>
<div id="hs"><div id="hsin"></div></div>
<div class="wrap" id="wrap">
${note}${tables}
</div>
<script>
(function () {
  var msg = document.getElementById('msg');
  var clear = document.getElementById('clear');
  var segs = document.querySelectorAll('.seg button');
  var wrap = document.getElementById('wrap');
  var hs = document.getElementById('hs');
  var hsin = document.getElementById('hsin');
  // every mode's table as drawn; the shown table is built again from it on each change
  var base = {};
  // the filters: one per condition step, all of them must hold (and); step index -> filter
  var filters = {};
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function current() { return wrap.querySelector('table.mt'); }
  // the top scrollbar follows the table, and the table follows it
  function fit() {
    var t = current();
    hsin.style.width = (t ? t.offsetWidth : 0) + 'px';
  }
  var lock = false;
  hs.addEventListener('scroll', function () { if (!lock) { lock = true; wrap.scrollLeft = hs.scrollLeft; lock = false; } });
  wrap.addEventListener('scroll', function () { if (!lock) { lock = true; hs.scrollLeft = wrap.scrollLeft; lock = false; } });
  function columnsOf(attr) {
    return (attr || '').split(',').filter(function (s) { return s !== ''; }).map(Number);
  }
  // the shown table: the scenarios that pass every filter, and only their columns
  function build() {
    var cur = current();
    if (!cur) { msg.innerHTML = ''; clear.hidden = true; fit(); return; }
    var original = base[cur.getAttribute('data-mode')];
    var n = Number(original.getAttribute('data-n'));
    var heads = original.querySelectorAll('thead tr.heads th.col');
    var keys = Object.keys(filters);
    var fresh = original.cloneNode(true);
    fresh.hidden = false;
    var cols = fresh.querySelectorAll('colgroup col');
    var shown = 0;
    var happy = 0;
    var vis = [];
    for (var k = 0; k < n; k++) {
      var ok = true;
      for (var j = 0; j < keys.length; j++) {
        if (filters[keys[j]].cols.indexOf(k) < 0) { ok = false; break; }
      }
      if (heads[k].classList.contains('ok')) happy++;
      vis[k] = ok;
      if (ok) {
        shown++;
      } else {
        var gone = fresh.querySelectorAll('.c' + k);
        for (var i = 0; i < gone.length; i++) gone[i].parentNode.removeChild(gone[i]);
        cols[k + 2].parentNode.removeChild(cols[k + 2]);
      }
    }
    // the Success and Negative bars span the columns that are shown; a bar with none is taken out
    var bars = fresh.querySelectorAll('thead tr.bar th.ok, thead tr.bar th.bad');
    for (var b = 0; b < bars.length; b++) {
      var kind = bars[b].classList.contains('ok') ? 'ok' : 'bad';
      var span = 0;
      for (var h = 0; h < n; h++) if (vis[h] && heads[h].classList.contains(kind)) span++;
      if (span) bars[b].setAttribute('colspan', span);
      else bars[b].parentNode.removeChild(bars[b]);
    }
    fresh.style.width = (${LABEL_W} + ${COMBO_W} + shown * ${COL_W}) + 'px';
    // the filter boxes that are on
    fresh.querySelectorAll('[data-key]').forEach(function (el) {
      var f = filters[el.getAttribute('data-ci')];
      el.classList.toggle('on', !!f && f.key === el.getAttribute('data-key'));
    });
    cur.parentNode.replaceChild(fresh, cur);
    if (!keys.length) {
      msg.innerHTML = n + ' scenarios (' + happy + ' Happy, ' + (n - happy) + ' Negative) · click a condition or a choice to see the scenarios that take it';
      clear.hidden = true;
    } else {
      var labels = keys.map(function (key) { return '<b>' + esc(filters[key].label) + '</b>'; }).join(' and ');
      msg.innerHTML = labels + ' · ' + (shown ? shown : 'none') + ' of ' + n + ' scenarios' + (shown ? '' : ' take all of these');
      clear.hidden = false;
    }
    fit();
  }
  // a click on a condition or a choice: it becomes the filter of its step; a second click on the
  // same box removes it, and a choice of a step that is filtered already replaces that filter
  function pick(el) {
    var ci = el.getAttribute('data-ci');
    var key = el.getAttribute('data-key');
    var f = filters[ci];
    if (f && f.key === key) delete filters[ci];
    else filters[ci] = { key: key, label: el.getAttribute('data-label'), cols: columnsOf(el.getAttribute('data-cols')) };
    build();
  }
  wrap.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-key]') : null;
    if (el) pick(el);
  });
  function clearAll() {
    filters = {};
    build();
  }
  function showMode(m) {
    filters = {};
    var fresh = base[m].cloneNode(true);
    fresh.hidden = false;
    var cur = current();
    if (cur) cur.parentNode.replaceChild(fresh, cur);
    else wrap.appendChild(fresh);
    segs.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    build();
  }
  segs.forEach(function (b) { b.addEventListener('click', function () { if (!b.disabled) showMode(b.getAttribute('data-mode')); }); });
  // the wheel and the trackpad scroll sideways too (shift + wheel, or a sideways swipe)
  wrap.addEventListener('wheel', function (e) {
    var dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    if (dx) { hs.scrollLeft += dx; e.preventDefault(); }
  }, { passive: false });
  clear.addEventListener('click', clearAll);
  // keep one table in the page at a time: the first one is the mode the panel chose
  var initial = null;
  document.querySelectorAll('table.mt').forEach(function (t) {
    base[t.getAttribute('data-mode')] = t.cloneNode(true);
    if (!t.hidden) initial = t.getAttribute('data-mode');
    t.parentNode.removeChild(t);
  });
  if (initial) showMode(initial); else build();
})();
</script>
</body></html>`;
}

/**
 * The size the page is drawn at on the board: the width of at least MIN_COLS scenarios (at
 * most MAX_COLS, the rest scroll sideways), and the height of every row of the tallest mode,
 * so every condition shows without scrolling down.
 */
export function decisionPageSize(modes: PageModeTable[]): { width: number; height: number } {
    const drawn = modes.flatMap((m) => (m.table ? [m.table] : []));
    const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, ...drawn.map((t) => t.columns.length), 0));
    const width = LABEL_W + COMBO_W + cols * COL_W + 24;
    const rows = Math.max(0, ...drawn.map((t) => layoutRows(t).total));
    const height = TOP_H + HS_H + BAR_H + HEAD_H + rows + 8;
    return { width, height };
}

/**
 * The page as an iframe on the board, the way the Test steps table is drawn: a component
 * alone, at `origin`. Its meta says it is a decision table page.
 */
export function decisionPageElement(opts: {
    modes: PageModeTable[];
    active: PageMode;
    name: string;
    origin: [number, number];
    generateId: () => string;
}): DrawdyElementSchema {
    const { width, height } = decisionPageSize(opts.modes);
    const shown = opts.modes.find((m) => m.mode === opts.active)?.table ?? null;
    return {
        type: "component",
        drawdyElementId: opts.generateId(),
        x: opts.origin[0],
        y: opts.origin[1],
        width,
        height,
        meta: { e2eDecisionPage: true, scenarios: shown ? shown.columns.length : 0, tsv: shown ? decisionToTsv(shown) : "" },
        schema: {
            type: "iframe",
            label: opts.name,
            child: { srcDoc: decisionHtml(opts.modes, opts.active, opts.name) },
            styles: { width: [width, "px"], height: [height, "px"] },
        },
    } as DrawdyElementSchema;
}
