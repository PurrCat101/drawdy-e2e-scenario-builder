// The interactive decision table (OUT-70): one page in an iframe, the same table as the
// boxes of OUT-60, with its first two columns and its head frozen, so it scrolls in both
// directions and holds any number of scenarios. Clicking a condition or a choice filters the
// columns to the scenarios that take it; a second click, or Show all, shows them again. The
// page has no link out and loads nothing from the network.

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { decisionToTsv, type DecisionTable } from "./core/decisionTable";

const LABEL_W = 210;
const COMBO_W = 260;
const COL_W = 96;
const ROW_H = 36;
/** the largest size the page is drawn at on the board; it scrolls inside that */
const MAX_W = 1100;
const MAX_H = 720;

const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON that is safe inside a script element. */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

/** The page's HTML with the table in it. Plain text only; no external resource. */
export function decisionHtml(t: DecisionTable, title: string): string {
    const n = t.columns.length;
    const happy = t.columns.flatMap((c, k) => (c.type === "happy" ? [k] : []));
    const neg = t.columns.flatMap((c, k) => (c.type === "neg" ? [k] : []));
    const cls = (k: number) => `col c${k}`;

    // the group bars, then the column heads named by the scenario ID (OUT-61)
    const bars =
        `<tr class="bar"><th class="corner" colspan="2"></th>` +
        (happy.length ? `<th class="ok" colspan="${happy.length}">Success</th>` : "") +
        (neg.length ? `<th class="bad" colspan="${neg.length}">Negative</th>` : "") +
        `</tr>`;
    const heads =
        `<tr class="heads"><th class="corner" colspan="2">Condition · Combinations</th>` +
        t.columns
            .map((c, k) => `<th class="${cls(k)} ${c.type === "happy" ? "ok" : "bad"}" title="${esc(c.id)}">${esc(c.id)}</th>`)
            .join("") +
        `</tr>`;

    // the body: a condition spans its values; a value's X boxes are in its row (OUT-62)
    let rows = "";
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
            rows += "<tr>";
            if (vi === 0)
                rows += `<th class="cond" rowspan="${count}" data-cols="${[...union].join(",")}" data-label="${esc(condName)}" title="Click: the scenarios that take any choice of this step">${esc(condName)}</th>`;
            rows += clickable
                ? `<td class="combo click" data-cols="${valueCols.join(",")}" data-label="${esc(v.label)}" title="Click: the scenarios that take this choice">${esc(v.label)}</td>`
                : `<td class="combo">${esc(v ? v.label : "")}</td>`;
            t.columns.forEach((_, k) => {
                rows += marks[k] ? `<td class="${cls(k)} x">x</td>` : `<td class="${cls(k)}"></td>`;
            });
            rows += "</tr>";
        }
    });

    const ids = t.columns.map((c) => c.id);
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #f8f9fa; color: #1f2933; font: 13px/1.4 system-ui, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; }
  .top { flex: none; display: flex; gap: 10px; align-items: center; padding: 6px 10px; border-bottom: 1px solid #dee2e6; background: #fff; min-height: 38px; }
  #msg { flex: 1; min-width: 0; font-size: 12px; color: #495057; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #msg b { color: #1f2933; }
  button { font: inherit; font-size: 12px; border: 1px solid #ced4da; background: #f1f3f5; border-radius: 12px; padding: 2px 10px; cursor: pointer; }
  button[hidden] { display: none; }
  .wrap { flex: 1; min-height: 0; overflow: auto; }
  table { border-collapse: separate; border-spacing: 0; }
  th, td { border-right: 1px solid #dee2e6; border-bottom: 1px solid #dee2e6; padding: 6px 8px; background: #fff; vertical-align: middle; }
  thead th { position: sticky; top: 0; z-index: 2; text-align: center; font-weight: 600; }
  thead tr.bar th { height: 28px; font-size: 12px; }
  thead tr.heads th { height: 36px; background: #e5dbff; border-color: #b197fc; }
  th.ok { background: #d3f9d8; }
  th.bad { background: #ffe3e3; }
  th.corner { position: sticky; left: 0; z-index: 4; text-align: left; font-size: 12px; color: #495057; background: #f1f3f5; width: ${LABEL_W + COMBO_W}px; min-width: ${LABEL_W + COMBO_W}px; }
  th.cond, td.combo { position: sticky; z-index: 1; }
  th.cond { left: 0; width: ${LABEL_W}px; min-width: ${LABEL_W}px; max-width: ${LABEL_W}px; text-align: left; background: #f3f0ff; font-weight: 600; }
  td.combo { left: ${LABEL_W}px; width: ${COMBO_W}px; min-width: ${COMBO_W}px; max-width: ${COMBO_W}px; background: #f1f3f5; }
  td.click, th.cond[data-cols] { cursor: pointer; }
  td.click:hover, th.cond:hover { background: #e9ecef; }
  th.cond.on, td.combo.on { background: #d0bfff; }
  td.x { text-align: center; background: #e5dbff; }
  td.x::before { content: "x"; display: inline-block; min-width: 26px; padding: 2px 0; border-radius: 6px; background: #b197fc; font-weight: 600; }
  .col { width: ${COL_W}px; min-width: ${COL_W}px; max-width: ${COL_W}px; }
  .off { display: none; }
</style>
</head>
<body>
<div class="top">
  <div id="msg">${n} scenarios · click a condition or a choice to see the scenarios that take it</div>
  <button id="clear" hidden>Show all</button>
</div>
<div class="wrap">
<table id="t">
<thead>${bars}${heads}</thead>
<tbody>${rows}</tbody>
</table>
</div>
<script>
(function () {
  var IDS = ${js(ids)};
  var N = ${n};
  var msg = document.getElementById('msg');
  var clear = document.getElementById('clear');
  var active = null;
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  function show(cols) {
    var on = {};
    cols.forEach(function (k) { on[k] = true; });
    for (var k = 0; k < N; k++) {
      var els = document.querySelectorAll('.c' + k);
      for (var i = 0; i < els.length; i++) els[i].classList.toggle('off', !on[k]);
    }
  }
  function reset() {
    active = null;
    var all = [];
    for (var k = 0; k < N; k++) all.push(k);
    show(all);
    document.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); });
    clear.hidden = true;
    msg.innerHTML = N + ' scenarios · click a condition or a choice to see the scenarios that take it';
  }
  document.querySelectorAll('[data-cols]').forEach(function (el) {
    el.addEventListener('click', function () {
      var same = active === el;
      reset();
      if (same) return;
      active = el;
      el.classList.add('on');
      var cols = el.getAttribute('data-cols').split(',').filter(function (s) { return s !== ''; }).map(Number);
      show(cols);
      var names = cols.map(function (k) { return IDS[k]; });
      msg.innerHTML = '<b>' + esc(el.getAttribute('data-label')) + '</b> · ' + cols.length + ' of ' + N + ' scenarios' +
        (names.length ? ': ' + esc(names.join(', ')) : ': none take it');
      clear.hidden = false;
    });
  });
  clear.addEventListener('click', reset);
})();
</script>
</body></html>`;
}

/** The size the page is drawn at on the board, before it scrolls. */
export function decisionPageSize(t: DecisionTable): { width: number; height: number } {
    const rows = t.conditions.reduce((s, _cd, ci) => s + Math.max(1, t.marks[ci].length), 0);
    const width = Math.min(MAX_W, LABEL_W + COMBO_W + t.columns.length * COL_W + 2);
    const height = Math.min(MAX_H, 28 + 36 + rows * ROW_H + 60);
    return { width, height };
}

/**
 * The page as an iframe on the board, the way the Test steps table is drawn: a component
 * alone, at `origin`. Its meta says it is a decision table page.
 */
export function decisionPageElement(opts: {
    table: DecisionTable;
    name: string;
    origin: [number, number];
    generateId: () => string;
}): DrawdyElementSchema {
    const { width, height } = decisionPageSize(opts.table);
    return {
        type: "component",
        drawdyElementId: opts.generateId(),
        x: opts.origin[0],
        y: opts.origin[1],
        width,
        height,
        meta: { e2eDecisionPage: true, scenarios: opts.table.columns.length, tsv: decisionToTsv(opts.table) },
        schema: {
            type: "iframe",
            label: opts.name,
            child: { srcDoc: decisionHtml(opts.table, opts.name) },
            styles: { width: [width, "px"], height: [height, "px"] },
        },
    } as DrawdyElementSchema;
}
