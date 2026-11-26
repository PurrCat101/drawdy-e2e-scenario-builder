// The decision table (specs/03-calculation.md, CALC-90 to 94): steps that decide are the
// rows, the scenarios of a mode the columns, an X where a scenario takes a choice.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFlowText } from "../src/core/syntax.ts";
import { generate, pick } from "../src/core/scenarios.ts";
import { buildDecisionTable, decisionToTsv } from "../src/core/decisionTable.ts";
import { TEMPLATES } from "../src/core/templates.ts";
import { renderDecisionTables } from "../src/decisionBoard.ts";
import { renderScenarios } from "../src/scenarioBoard.ts";
import { textRows } from "../src/textBox.ts";

const FLOW = `@builder
1. Login
   - ok
   - bad -> end
     then: 401 BAD_LOGIN
2. Pick
   - a
   - b
   - more -> loop to step 2
3. Note
   - one choice only
4. Pay
   - paid
   - declined -> end
     then: 402 DECLINED
   - no funds -> end
`;

const table = (text: string, mode: "all" | "ep" | "pair" | "min" = "all") => {
    const flow = parseFlowText(text).flow;
    const list = pick(generate(flow), mode);
    return { flow, list, dt: buildDecisionTable(flow, list) };
};

test("CALC-90: a condition is a step with two or more choices; its values are its choices in order", () => {
    const { dt } = table(FLOW);
    assert.deepEqual(dt.conditions.map((c) => [c.step, c.name, c.values.map((v) => v.label)]), [
        [0, "Login", ["ok", "bad"]],
        [1, "Pick", ["a", "b", "more"]],
        [3, "Pay", ["paid", "declined", "no funds"]],
    ]);
    // "Note" has one choice: not a condition
    assert.ok(!dt.conditions.some((c) => c.name === "Note"));
});

test("CALC-90: the starter template has a condition for every step with two or more choices", () => {
    const flow = parseFlowText(TEMPLATES[0].text).flow;
    const dt = buildDecisionTable(flow, pick(generate(flow), "ep"));
    assert.equal(dt.conditions.length, flow.steps.filter((s) => s.conds.length >= 2).length);
    assert.ok(dt.conditions.length >= 8);
});

test("CALC-91 CALC-57: Happy scenarios are the first columns (Success), then Negative; a column is named by its scenario ID", () => {
    const { dt, list } = table(FLOW);
    assert.equal(dt.columns.length, list.length);
    const types = dt.columns.map((c) => c.type);
    const firstNeg = types.indexOf("neg");
    assert.ok(firstNeg > 0 && types.slice(0, firstNeg).every((t) => t === "happy") && types.slice(firstNeg).every((t) => t === "neg"));
    assert.equal(dt.success, firstNeg);
    const ids = dt.columns.map((c) => c.id);
    assert.equal(ids[0], "TSS-001");
    assert.equal(ids[firstNeg], "TSN-001");
    // the IDs of the mode's own list: running numbers, so the biggest is the count
    assert.equal(ids[firstNeg - 1], "TSS-" + String(firstNeg).padStart(3, "0"));
    assert.equal(ids[ids.length - 1], "TSN-" + String(ids.length - firstNeg).padStart(3, "0"));
});

test("CALC-92: a value is marked when the scenario takes the choice; a step it never reaches has no mark", () => {
    const { dt } = table(FLOW);
    const col = (pred: (k: number) => boolean) => dt.columns.map((_, k) => k).filter(pred);
    const marked = (ci: number, vi: number, k: number) => dt.marks[ci][vi][k];
    // "bad -> end" scenario: marks only Login/bad, nothing at Pick or Pay
    const bad = col((k) => marked(0, 1, k));
    assert.equal(bad.length, 1);
    for (const k of bad) {
        assert.ok(dt.marks[1].every((v) => !v[k]), "Pick is not reached");
        assert.ok(dt.marks[2].every((v) => !v[k]), "Pay is not reached");
    }
    // a scenario that loops marks both "more" and the choice it picks after it
    const looped = col((k) => marked(1, 2, k));
    assert.ok(looped.length > 0);
    for (const k of looped) assert.ok(marked(1, 0, k) || marked(1, 1, k), "a loop marks a pick as well as 'more'");
    // a scenario that does not loop does not mark "more"
    const plain = col((k) => !marked(1, 2, k) && marked(0, 0, k));
    assert.ok(plain.length > 0);
});

test("CALC-94: a flow without a step that decides has no condition", () => {
    const { dt } = table("@builder\n1. A\n   - only\n2. B\n   - only too\n");
    assert.deepEqual(dt.conditions, []);
});

test("CALC-91: the modes give their own scenarios as columns", () => {
    const all = table(FLOW, "all").dt.columns.length;
    const ep = table(FLOW, "ep").dt.columns.length;
    const min = table(FLOW, "min").dt.columns.length;
    assert.ok(all >= ep && ep >= min && min >= 1);
});

test("CALC-92 OUT-64: the TSV has the scenario IDs as heads, the groups and the X marks", () => {
    const { dt } = table(FLOW, "min");
    const rows = decisionToTsv(dt).split("\n").map((r) => r.split("\t"));
    assert.deepEqual(rows[0].slice(0, 2), ["Condition", "Combination"]);
    assert.deepEqual(rows[0].slice(2), dt.columns.map((c) => c.id));
    assert.equal(rows[0][2], "TSS-001");
    assert.ok(!rows[0].includes("Expected"), "no Expected column");
    assert.deepEqual(rows[1].slice(0, 2), ["", "Group"]);
    assert.equal(rows[1][2], "Success");
    const login = rows.find((r) => r[0] === "1. Login")!;
    assert.equal(login[1], "ok");
    assert.ok(!rows.some((r) => r[0] === "Result"), "there are no result rows");
    // every row has the same number of cells
    assert.ok(rows.every((r) => r.length === rows[0].length));
});

test("CALC-92: a label with a tab, a quote or a line break is quoted in the TSV", () => {
    const flow = parseFlowText('@builder\n1. S\n   - say "hi"\n   - plain\n').flow;
    const dt = buildDecisionTable(flow, pick(generate(flow), "all"));
    assert.ok(decisionToTsv(dt).includes('"say ""hi"""'));
});

/* ------------------------------ drawing (OUT-60 to 64) ------------------------------ */

const draw = (text: string, mode: "all" | "ep" | "pair" | "min" = "all") => {
    const { flow, dt } = table(text, mode);
    let n = 0;
    const out = renderDecisionTables({ table: dt, flow, mode, name: "Decision table · All Paths", origin: [100, 200], generateId: () => "e" + ++n });
    const els = out.elements as any[];
    const frames = els.filter((e) => e.type === "frame");
    const boxes = els.filter((e) => e.type === "shape");
    return { flow, dt, out, els, frames, boxes };
};
const inside = (b: any, f: any) =>
    b.x >= f.position[0] && b.y >= f.position[1] && b.x + b.width <= f.position[0] + f.width && b.y + b.height <= f.position[1] + f.height;
const overlap = (a: any, b: any) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("OUT-60: a decision table is plain text boxes with a fill and black text, in a frame, never an embedded page", () => {
    const { els, frames, boxes } = draw(FLOW);
    assert.ok(frames.length >= 1);
    assert.ok(!els.some((e) => e.type === "component"), "no embedded page");
    assert.ok(boxes.length > 20);
    for (const b of boxes) {
        assert.equal(b.componentType, "rect");
        assert.equal(b.textColor, "#000000", "black text: " + b.text);
        assert.ok(b.fillColor && b.fillColor !== b.textColor);
    }
    assert.match(frames[0].name, /^Decision table · All Paths · (\d+ scenarios|Scenarios 1 to \d+ of \d+)$/);
    assert.deepEqual(frames[0].position, [100, 200]);
});

test("OUT-61: Success and Negative bars, a box named by the scenario ID for each column, at most 10 columns a frame", () => {
    const { dt, frames, boxes } = draw(TEMPLATES[0].text, "ep");
    const n = dt.columns.length;
    assert.ok(n > 10, "the template makes more than 10 scenarios in EP");
    assert.equal(frames.length, Math.ceil(n / 10));
    frames.slice(0, -1).forEach((f) => assert.match(f.name, /Scenarios \d+ to \d+ of \d+$/));
    // a box for every column, named by its scenario ID, once
    const heads = boxes.filter((b) => /^TS[SN]-\d{3,}$/.test(b.text));
    assert.deepEqual(heads.map((b) => b.text), dt.columns.map((c) => c.id));
    // a bar over the Happy columns, and one over the Negative ones, in the frames that have them
    const successBars = boxes.filter((b) => b.text === "Success");
    const altBars = boxes.filter((b) => b.text === "Negative");
    assert.ok(successBars.length >= 1 && altBars.length >= 1);
    assert.ok(successBars.every((b) => b.fillColor === "#dcfce7") && altBars.every((b) => b.fillColor === "#fee2e2"));
    const headOf = (b: any) =>
        heads.filter((h) => h.frameId === b.frameId && h.x >= b.x && h.x + h.width <= b.x + b.width && h.y > b.y);
    for (const b of successBars) assert.ok(headOf(b).every((h) => h.text.startsWith("TSS-")));
    for (const b of altBars) assert.ok(headOf(b).every((h) => h.text.startsWith("TSN-")));
});

test("OUT-65: column k of the decision table and note k of the Scenarios frame are the same scenario", () => {
    for (const [text, mode] of [[FLOW, "all"], [TEMPLATES[0].text, "ep"], [TEMPLATES[0].text, "pair"], [TEMPLATES[0].text, "min"]] as const) {
        const flow = parseFlowText(text).flow;
        const gen = generate(flow);
        const shown = pick(gen, mode);
        let n = 0;
        const id = () => `i${n++}`;
        const board = renderScenarios({
            flow, mode, shown, gen, counts: { all: 1, ep: 1, pair: 1, min: 1 }, issues: [], origin: [0, 0], generateId: id,
        });
        const noteIds = (board.elements as any[]).filter((e) => e.meta && e.meta.kind === "scenario").map((e) => e.meta.id);
        const dt = buildDecisionTable(flow, shown);
        assert.deepEqual(dt.columns.map((c) => c.id), noteIds, `${mode}: the columns and the notes are in the same order`);
    }
});

test("OUT-66: every frame keeps the flow and mode, and every column head is a scenario with its path and mode", () => {
    const { flow, dt, frames, boxes } = draw(TEMPLATES[0].text, "ep");
    assert.ok(frames.length > 1, "a table in several frames");
    for (const f of frames) {
        assert.equal(f.meta.mode, "ep");
        assert.deepEqual(f.meta.flow, flow);
    }
    const heads = boxes.filter((b) => b.meta?.kind === "scenario");
    assert.equal(heads.length, dt.columns.length);
    heads.forEach((h, k) => {
        const c = dt.columns[k];
        assert.equal(h.text, c.id);
        assert.deepEqual(h.meta, { kind: "scenario", id: c.id, type: c.type, pri: c.pri, path: c.path, mode: "ep" });
        // the head sits in the frame that holds the flow
        assert.ok(frames.some((f) => f.drawdyElementId === h.frameId));
    });
    // only the heads are scenarios: a value box or an X is not
    assert.ok(boxes.filter((b) => b.meta).every((b) => b.meta.kind === "scenario"));
});

test("OUT-62: a box for each condition and value, and an X where a scenario takes it", () => {
    const { dt, frames, boxes } = draw(FLOW);
    const one = frames[0];
    const mine = boxes.filter((b) => inside(b, one));
    for (const cd of dt.conditions) assert.equal(mine.filter((b) => b.text === `${cd.step + 1}. ${cd.name}`).length, 1);
    for (const cd of dt.conditions) for (const v of cd.values) assert.ok(mine.some((b) => b.text === v.label), v.label);
    // one X for every mark, in the column of its scenario
    const marks = dt.marks.flat(2).filter(Boolean).length;
    assert.equal(boxes.filter((b) => b.text === "X").length, marks);
    const heads = boxes.filter((b) => /^TS[SN]-\d{3,}$/.test(b.text));
    for (const x of boxes.filter((b) => b.text === "X")) {
        const col = heads.find((h) => x.x >= h.x && x.x + x.width <= h.x + h.width);
        assert.ok(col, "an X sits under a column head");
    }
});

test("OUT-60 OUT-62: the boxes of a frame stay inside it, do not overlap, and are tall enough for their text", () => {
    for (const [text, mode] of [[FLOW, "all"], [TEMPLATES[0].text, "pair"]] as const) {
        const { frames, boxes } = draw(text, mode);
        for (const f of frames) {
            const mine = boxes.filter((b) => b.frameId === f.drawdyElementId);
            assert.ok(mine.length > 0);
            for (const b of mine) {
                assert.ok(inside(b, f), `${b.text} is outside its frame`);
                // a box in the grid is centred, so it needs less space round the text than a note
                const need = textRows(b.text, b.width, b.fontSize) * b.fontSize * 1.4 + 8;
                assert.ok(b.height >= need - 1, `${b.text} is too short`);
            }
            for (let i = 0; i < mine.length; i++)
                for (let j = i + 1; j < mine.length; j++)
                    assert.ok(!overlap(mine[i], mine[j]), `${mine[i].text} overlaps ${mine[j].text}`);
        }
    }
});

test("OUT-64: every frame carries the TSV of the whole table and the number of scenarios", () => {
    const { dt, frames } = draw(TEMPLATES[0].text, "ep");
    assert.ok(frames.length > 1);
    for (const f of frames) {
        assert.equal(f.meta.e2eDecision, true);
        assert.equal(f.meta.scenarios, dt.columns.length);
        assert.equal(f.meta.tsv, decisionToTsv(dt));
    }
});

test("OUT-61: frames of one table are one under the other, the same width at the left edge, and do not overlap", () => {
    const { frames } = draw(TEMPLATES[0].text, "ep");
    for (let i = 1; i < frames.length; i++) {
        assert.equal(frames[i].position[0], frames[0].position[0]);
        assert.ok(frames[i].position[1] >= frames[i - 1].position[1] + frames[i - 1].height, "a frame starts below the one before");
    }
});
