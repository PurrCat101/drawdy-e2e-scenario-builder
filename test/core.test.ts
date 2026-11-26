// The core (specs/07-core.md): nothing in src/core reaches outside it, and buildReport gives
// a front end everything in plain data.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildReport, TEMPLATES, generate, pick, parseFlowText, scenariosToTsv, scenarioFlow, orderScenarios, flowStepRows, flowStepsToTsv, STEPS_LIST_COLUMNS } from "../src/core/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORE = join(here, "..", "src", "core");

test("CORE-01: no file in src/core imports from outside it, from @drawdy or node:, or uses browser or Node globals", () => {
    const files = readdirSync(CORE).filter((f) => f.endsWith(".ts"));
    assert.ok(files.length >= 10, "the core folder has its files");
    for (const f of files) {
        // comments are not code: drop them before looking
        const code = readFileSync(join(CORE, f), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const m of code.matchAll(/(?:import|export)[^;]*?from\s+["']([^"']+)["']/g)) {
            const spec = m[1];
            assert.match(spec, /^\.\/[A-Za-z]+$/, `${f}: imports "${spec}" (only files of this folder)`);
        }
        assert.doesNotMatch(code, /\b(?:document|window|localStorage|require)\b\s*[.(\[]/, `${f}: browser or Node global`);
        assert.doesNotMatch(code, /\bprocess\s*\./, `${f}: process`);
        assert.doesNotMatch(code, /@drawdy|node:/, `${f}: host import`);
    }
});

test("CORE-02 CORE-10: buildReport gives plain data with the flow, counts, scenarios and both copy texts", () => {
    const r = buildReport(TEMPLATES[0].text, "pair");
    const back = JSON.parse(JSON.stringify(r));
    assert.deepEqual(back.counts, r.counts);
    assert.equal(back.scenarios.length, r.scenarios.length);
    assert.equal(back.stepsTsv, r.stepsTsv);
    assert.equal(back.decisionTsv, r.decisionTsv);
    assert.ok(r.scenarios.length > 0 && r.scenarios.length === r.counts.pair, "Pair picks as many as its count says");
    const ids = r.scenarios.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "IDs are unique");
    for (const s of r.scenarios) {
        assert.match(s.id, /^TS[SN]-\d+$/);
        assert.ok(s.rows.length > 0 && s.note.length > 0 && s.choices.length >= 0);
        assert.equal(s.type === "happy", s.id.startsWith("TSS-"));
    }
    assert.ok(r.header.length >= 4, "a header with counts, coverage and tip");
    assert.ok(r.stepsTsv.split("\n")[0].startsWith("Scenario\t#\tStep"), "header row first, scenario ID column first");
    assert.ok(r.decisionTsv && /^Condition\tCombination\tTS[SN]-\d+/.test(r.decisionTsv), "the template has steps that decide");
});

test("CORE-10: every mode of buildReport picks as many scenarios as the counts say", () => {
    for (const mode of ["all", "pair", "min"] as const) {
        const r = buildReport(TEMPLATES[0].text, mode);
        assert.equal(r.scenarios.length, r.counts[mode], mode);
        assert.equal(r.mode, mode);
    }
});

test("CORE-10: a flow with no step that decides has no decision table", () => {
    const r = buildReport("@builder\n1. Open\n2. Close\n", "all");
    assert.equal(r.decisionTsv, null);
    assert.equal(r.scenarios.length, 1);
});

test("CORE-11: the report has the scenarios, order and copied text the pieces give for the same text and mode", () => {
    const text = TEMPLATES[0].text;
    const flow = parseFlowText(text).flow;
    for (const mode of ["all", "pair", "min"] as const) {
        const shown = orderScenarios(pick(generate(flow), mode));
        const r = buildReport(text, mode);
        assert.deepEqual(r.scenarios.map((s) => s.id), shown.map((s) => s.id), mode);
        const tsv = scenariosToTsv(
            shown.map((sc) => ({
                title: sc.id,
                flow: scenarioFlow(flow, sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null])),
            }))
        );
        assert.equal(r.stepsTsv, tsv, mode);
    }
});

test("CORE-12: a text with no step gives no scenarios and does not throw", () => {
    for (const text of ["", "   \n", "@builder\n"]) {
        const r = buildReport(text, "pair");
        assert.equal(r.scenarios.length, 0, JSON.stringify(text));
        assert.deepEqual(r.counts, { all: 0, pair: 0, min: 0 }, JSON.stringify(text));
        assert.equal(r.decisionTsv, null);
        assert.ok(r.warnings.length > 0, "says why: " + JSON.stringify(text));
    }
    // any other text is read as one step
    assert.equal(buildReport("just some words", "pair").scenarios.length, 1);
});

test("OUT-67 CORE-10: the steps list has a row per choice, a row per step with no choice, and the requirement IDs of step and choice", () => {
    const flow = parseFlowText(`@builder
1. Login
   req: REQ-1; REQ-3
   - ok
     req: REQ-2, REQ-1
   - bad -> end
2. Note
3. Pay
   - paid
`).flow;
    const rows = flowStepRows(flow);
    assert.deepEqual(rows.map((r) => [r.n, r.step, r.cond, r.req]), [
        ["1", "1. Login", "ok", "REQ-1, REQ-3, REQ-2"],
        ["2", "1. Login", "bad  ✖", "REQ-1, REQ-3"],
        ["3", "2. Note", "", ""],
        ["4", "3. Pay", "paid", ""],
    ]);
    const lines = flowStepsToTsv(flow).split("\n");
    assert.equal(lines.length, 5);
    assert.deepEqual(lines[0].split("\t"), STEPS_LIST_COLUMNS.map((c) => c.title));
    assert.equal(buildReport("@builder\n1. Login\n- ok\n- bad -> end\n", "all").stepsListTsv.split("\n").length, 3);
});
