// Property-based tests (TEST-12, fast-check): rules that must hold for every flow, not just
// the sample flows in the other test files. A failing property is shrunk to the
// smallest flow that still fails, and printed with its seed so it can be replayed.

import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { Cond, Flow } from "../src/flow.ts";
import { formatFlow, parseFlowText } from "../src/syntax.ts";
import { generate, pick } from "../src/scenarios.ts";
import { analyze, clearCache } from "../src/analysis.ts";

const RUNS = Number(process.env.PBT_RUNS ?? 300);

/* ------------------------------- generators ------------------------------- */

/** Names and labels: plain words, Thai, and text that looks like syntax. */
const word = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom("Login", "Pay", "ok", "failed", "เลือกสินค้า", "ชำระเงิน", "a b", "x") },
    { weight: 2, arbitrary: fc.constantFrom("1. fake", "- dash", "[P1]", "Pay [visa]", "a (b|c)", "# not a comment", "\\back", "given: x", "@title t") },
    { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) }
).map((s) => s.replace(/\s+/g, " ").trim() || "x")
    // an unclosed "[" cannot be told from the start of the options (SYN-13): not written
    .filter((s) => !/\[[^\]]*$/.test(s));

const tag = fc.constantFrom("t1", "t2", "t3");
const literal = fc.tuple(fc.boolean(), tag).map(([not, t]) => (not ? "!" : "") + t);
const need = fc.oneof(
    { weight: 3, arbitrary: fc.constant("") },
    { weight: 1, arbitrary: literal },
    { weight: 1, arbitrary: fc.tuple(literal, literal).map(([a, b]) => `${a},${b}`) },
    { weight: 1, arbitrary: fc.tuple(literal, literal).map(([a, b]) => `${a}|${b}`) }
);
const text = fc.option(fc.constantFrom("note", "ผลลัพธ์", "two words", "a -> b"), { nil: undefined });

/** A flow of up to `maxSteps` steps; ids follow the reader's own (s0, s0c0), loops go back only. */
function flowOf(maxSteps: number, loops: boolean): fc.Arbitrary<Flow> {
    return fc.integer({ min: 1, max: maxSteps }).chain((n) =>
        fc
            .tuple(
                ...Array.from({ length: n }, (_, i) =>
                    fc.record({
                        name: word,
                        pre: text,
                        data: text,
                        exp: text,
                        req: text,
                        conds: fc.array(
                            fc.record({
                                label: word,
                                kind: fc.constantFrom("next", "next", "next", "end", ...(loops && i > 0 ? (["loop"] as const) : [])),
                                neg: fc.boolean(),
                                target: fc.integer({ min: 0, max: i }),
                                max: fc.integer({ min: 1, max: 3 }),
                                tags: fc.option(tag, { nil: "" }),
                                need,
                                pri: fc.constantFrom("", "", "1", "2", "3"),
                                variant: fc.boolean(),
                                distinct: fc.boolean(),
                                data: text,
                                exp: text,
                            }),
                            { maxLength: 3 }
                        ),
                    })
                )
            )
            .map((rows) => ({
                steps: rows.map((r, i) => ({
                    id: `s${i}`,
                    name: r.name,
                    pre: r.pre,
                    data: r.data,
                    exp: r.exp,
                    req: r.req,
                    conds: r.conds.map(
                        (c, j): Cond => ({
                            id: `s${i}c${j}`,
                            label: c.label,
                            neg: c.kind === "end" ? true : c.neg,
                            action: c.kind as Cond["action"],
                            target: c.kind === "loop" ? `s${c.target}` : null,
                            max: c.kind === "loop" ? c.max : 1,
                            tags: c.tags ?? "",
                            need: c.need,
                            pri: c.pri,
                            variant: c.variant,
                            distinct: c.kind === "loop" ? c.distinct : undefined,
                            data: c.data,
                            exp: c.exp,
                        })
                    ),
                })),
            }))
    );
}

/** What the reader is expected to give back: undefined / empty fields are the same. */
function canon(flow: Flow) {
    const e = (s?: string) => (s && s.trim() ? s.trim() : undefined);
    return flow.steps.map((s) => ({
        name: s.name,
        pre: e(s.pre),
        data: e(s.data),
        exp: e(s.exp),
        req: e(s.req),
        conds: s.conds.map((c) => ({
            label: c.label,
            neg: c.neg,
            action: c.action,
            // a loop is stored by the step it goes back to: compare by position
            target: c.target ? flow.steps.findIndex((x) => x.id === c.target) : null,
            max: c.max,
            tags: c.tags,
            need: c.need,
            pri: c.pri,
            variant: c.variant,
            distinct: !!c.distinct,
            data: e(c.data),
            exp: e(c.exp),
        })),
    }));
}

/* -------------------------------- properties ------------------------------- */

test("SYN-40 (property): writing a flow and reading it back gives the same flow", () => {
    fc.assert(
        fc.property(flowOf(5, true), (flow) => {
            const back = parseFlowText(formatFlow(flow)).flow;
            assert.deepEqual(canon(back), canon(flow));
        }),
        { numRuns: RUNS }
    );
});

/** Flows small enough that every path is listed (no search past the limit). */
const small = flowOf(4, true);
const ids = (xs: { id: string }[]) => xs.map((s) => s.id);

test("CALC-50, CALC-51 (property): scenario IDs are unique, well formed and the same on every run", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const a = generate(flow, 1000, 1e9);
            const b = generate(flow, 1000, 1e9);
            assert.deepEqual(ids(a.list), ids(b.list));
            assert.equal(new Set(ids(a.list)).size, a.list.length, "IDs must be unique");
            for (const s of a.list) {
                assert.match(s.id, /^TS[SN]-\d{5}$/);
                assert.equal(s.id.startsWith(s.type === "happy" ? "TSS" : "TSN"), true);
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-53 (property): text a scenario does not walk by (data, expected, setup, requirement) never changes an ID", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const bare: Flow = {
                steps: flow.steps.map((s) => ({
                    ...s,
                    pre: undefined,
                    data: undefined,
                    exp: undefined,
                    req: undefined,
                    conds: s.conds.map((c) => ({ ...c, pre: undefined, data: undefined, exp: undefined, req: undefined })),
                })),
            };
            assert.deepEqual(ids(generate(flow, 1000, 1e9).list), ids(generate(bare, 1000, 1e9).list));
        }),
        { numRuns: RUNS }
    );
});

test("CALC-30, CALC-83 (property): every mode picks only scenarios of All Paths, none twice, and something when there is something", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            const all = new Set(ids(g.list));
            for (const mode of ["all", "ep", "pair", "min"] as const) {
                const got = ids(pick(g, mode));
                assert.equal(new Set(got).size, got.length, `${mode}: a scenario twice`);
                for (const id of got) assert.ok(all.has(id), `${mode}: ${id} is not in All Paths`);
                if (g.list.length) assert.ok(got.length > 0, `${mode}: nothing picked`);
                assert.ok(got.length <= g.list.length, `${mode}: more than All Paths`);
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-80, CALC-81 (property): the remembered analysis gives what a fresh calculation gives", () => {
    clearCache();
    fc.assert(
        fc.property(small, (flow) => {
            const a = analyze(flow);
            const g = generate(flow, 1000, 1e9);
            for (const mode of ["all", "ep", "pair", "min"] as const) {
                assert.deepEqual(ids(a.pick(mode)), ids(pick(g, mode)), mode);
            }
            assert.equal(analyze(flow), a, "the second call must reuse the first");
        }),
        { numRuns: RUNS }
    );
});

test("SYN-40 (property): a flow written and read back has the same scenarios", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const back = parseFlowText(formatFlow(flow)).flow;
            assert.deepEqual(ids(generate(back, 1000, 1e9).list), ids(generate(flow, 1000, 1e9).list));
        }),
        { numRuns: RUNS }
    );
});

/* the smallest flows the properties found, kept as plain examples */

test("SYN-40: a choice named like options (Pay [visa]) is written with [] and read back whole", () => {
    const flow: Flow = {
        steps: [
            {
                id: "s0",
                name: "Pay",
                conds: [{ id: "s0c0", label: "Pay [visa]", neg: false, action: "next", target: null, max: 1, tags: "", need: "", pri: "", variant: false }],
            },
        ],
    };
    const text = formatFlow(flow);
    assert.match(text, /- Pay \[visa\] \[\]/);
    const r = parseFlowText(text);
    assert.equal(r.flow.steps[0].conds[0].label, "Pay [visa]");
    assert.deepEqual(r.warnings, []);
});

test("CALC-83: a flow without choices still gets one scenario in every mode", () => {
    const flow: Flow = { steps: [{ id: "s0", name: "Open", conds: [] }, { id: "s1", name: "Close", conds: [] }] };
    const g = generate(flow, 1000, 1e9);
    for (const mode of ["all", "ep", "pair", "min"] as const) assert.equal(pick(g, mode).length, 1, mode);
});
