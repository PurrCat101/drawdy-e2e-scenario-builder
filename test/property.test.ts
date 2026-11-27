// Property-based tests (TEST-12, fast-check): rules that must hold for every flow, not just
// the sample flows in the other test files. A failing property is shrunk to the
// smallest flow that still fails, and printed with its seed so it can be replayed.

import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { Cond, Flow } from "../src/core/flow.ts";
import { formatFlow, parseFlowText } from "../src/core/syntax.ts";
import { generate, pick, singles } from "../src/core/scenarios.ts";
import { analyze, clearCache } from "../src/core/analysis.ts";
import { buildDecisionTable } from "../src/core/decisionTable.ts";

const RUNS = Number(process.env.PBT_RUNS ?? 300);

/* ------------------------------- generators ------------------------------- */

/** Names and labels: plain words, Thai, and text that looks like syntax. */
const word = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom("Login", "Pay", "ok", "failed", "เลือกสินค้า", "ชำระเงิน", "a b", "x") },
    { weight: 2, arbitrary: fc.constantFrom("1. fake", "- dash", "[P1]", "Pay [visa]", "a [b", "[", "a\\[b", "x [ y [z]", "a (b|c)", "# not a comment", "\\back", "given: x", "@title t") },
    { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
    { weight: 2, arbitrary: fc.array(fc.constantFrom("[", "]", "\\", "a", " "), { minLength: 1, maxLength: 8 }).map((x) => x.join("")) }
).map((s) => s.replace(/\s+/g, " ").trim() || "x");

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

test("CALC-50, CALC-55, CALC-56 (property): scenario IDs are unique, run 1, 2, 3 per prefix and are the same on every run", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const a = generate(flow, 1000, 1e9);
            const b = generate(flow, 1000, 1e9);
            assert.deepEqual(ids(a.list), ids(b.list));
            assert.equal(new Set(ids(a.list)).size, a.list.length, "IDs must be unique");
            const count = { happy: 0, neg: 0 };
            for (const s of a.list) {
                count[s.type]++;
                const prefix = s.type === "happy" ? "TSS" : "TSN";
                assert.equal(s.id, `${prefix}-${String(count[s.type]).padStart(3, "0")}`);
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-57 (property): every mode numbers the scenarios it picks 1, 2, 3 per prefix, so its biggest ID is its count", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            for (const mode of ["all", "pair", "min"] as const) {
                const got = pick(g, mode);
                const count = { happy: 0, neg: 0 };
                for (const s of got) {
                    count[s.type]++;
                    assert.equal(s.id, `${s.type === "happy" ? "TSS" : "TSN"}-${String(count[s.type]).padStart(3, "0")}`, mode);
                }
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-56 (property): text a scenario does not walk by (data, expected, setup, requirement) never changes an ID", () => {
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
            // a mode numbers its own scenarios (CALC-57): compare by `n`, the place in All
            const all = new Set(g.list.map((s) => s.n));
            for (const mode of ["all", "pair", "min"] as const) {
                const got = pick(g, mode).map((s) => s.n);
                assert.equal(new Set(got).size, got.length, `${mode}: a scenario twice`);
                for (const n of got) assert.ok(all.has(n), `${mode}: #${n} is not in All Paths`);
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
            for (const mode of ["all", "pair", "min"] as const) {
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
                conds: [{ id: "s0c0", label: "Pay [visa]", neg: false, action: "next", target: null, max: 1, tags: "", need: "", pri: "" }],
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
    for (const mode of ["all", "pair", "min"] as const) assert.equal(pick(g, mode).length, 1, mode);
});

test("SYN-13: \\[ in a choice's label is a plain [, not the start of the options", () => {
    const r = parseFlowText("@builder\n1. A\n   - Pay \\[visa [P1]\n   - ok\n");
    assert.equal(r.flow.steps[0].conds[0].label, "Pay [visa");
    assert.equal(r.flow.steps[0].conds[0].pri, "1");
    assert.deepEqual(r.warnings, []);
});

test("SYN-40: a label with an unclosed [ is written with \\[ and read back whole", () => {
    const flow: Flow = {
        steps: [{ id: "s0", name: "A", conds: [{ id: "s0c0", label: "a [b", neg: false, action: "next", target: null, max: 1, tags: "", need: "", pri: "1" }] }],
    };
    const text = formatFlow(flow);
    assert.match(text, /- a \\\[b \[P1\]/);
    assert.equal(parseFlowText(text).flow.steps[0].conds[0].label, "a [b");
});

/* ----- coverage promises of the modes, and the rules of loops (more PBT) ----- */

/** Ids of the taken choices of a scenario, in order (the loop's own step has `c`; a step with no choice has none). */
const taken = (sc: { path: { i: number; c: Cond | null }[] }) => sc.path.filter((v) => v.c).map((v) => v);

test("CALC-30, CALC-33, CALC-34, CALC-36 (property): each mode keeps every choice and every pair it promises, and every loop's last round", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            if (!g.list.length) return;
            const all = new Set<string>();
            const pairs = (list: typeof g.list) => {
                const out = new Set<string>();
                for (const sc of list) {
                    const a = [...new Set(taken(sc).map((v) => v.c!.id))].sort();
                    for (let p = 0; p < a.length; p++) for (let q = p + 1; q < a.length; q++) out.add(a[p] + "&" + a[q]);
                }
                return out;
            };
            const ids = (list: typeof g.list) => new Set(list.flatMap((sc) => taken(sc).map((v) => v.c!.id)));
            for (const sc of g.list) taken(sc).forEach((v) => all.add(v.c!.id));
            const everyPair = pairs(g.list);
            const ends = new Set(g.list.flatMap((sc) => singles(sc).filter((x) => x.startsWith("end:"))));

            const pairGot = pairs(pick(g, "pair"));
            for (const p of everyPair) assert.ok(pairGot.has(p), `pair ${p} is covered by All but not by Pair`);

            for (const mode of ["pair", "min"] as const) {
                const sel = pick(g, mode);
                const have = ids(sel);
                for (const id of all) assert.ok(have.has(id), `${mode}: choice ${id} is covered by All but not by this mode`);
                const haveSingles = new Set(sel.flatMap((sc) => singles(sc)));
                for (const e of ends) assert.ok(haveSingles.has(e), `${mode}: ${e} is covered by All but not by this mode`);
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-28, CALC-29 (property): Pair and Each hold a base path and no useless scenario", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            const happy = g.list.filter((sc) => sc.type === "happy");
            const fewest = Math.min(...happy.map((sc) => sc.loops));
            for (const mode of ["pair", "min"] as const) {
                const sel = pick(g, mode);
                if (happy.length)
                    assert.ok(sel.some((sc) => sc.type === "happy" && sc.loops === fewest), mode + ": no base path");
                const items = (sc: (typeof sel)[number]) => {
                    const ids = [...new Set(taken(sc).map((v) => v.c!.id))].sort();
                    const out = [...singles(sc)];
                    if (mode === "pair") for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) out.push(ids[a] + "&" + ids[b]);
                    if (sc.type === "happy" && sc.loops === fewest) out.push("base path");
                    return out;
                };
                if (sel.length > 1)
                    sel.forEach((sc, k) => {
                        const others = new Set(sel.filter((_, j) => j !== k).flatMap(items));
                        assert.ok(items(sc).some((x) => !others.has(x)), mode + ": #" + sc.n + " adds nothing");
                    });
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-17 (property): a loop with max m is taken at most m times in one scenario", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            for (const sc of g.list) {
                const count = new Map<string, number>();
                for (const v of taken(sc)) count.set(v.c!.id, (count.get(v.c!.id) ?? 0) + 1);
                for (const step of flow.steps) {
                    for (const c of step.conds) {
                        if (c.action !== "loop") continue;
                        assert.ok((count.get(c.id) ?? 0) <= c.max, `${c.id} taken ${count.get(c.id)} times, max ${c.max}`);
                    }
                }
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-17 (property): in the rounds of a distinct loop, its target step never repeats a choice", () => {
    fc.assert(
        fc.property(small, (flow) => {
            const g = generate(flow, 1000, 1e9);
            for (const sc of g.list) {
                const path = sc.path;
                for (const step of flow.steps) {
                    for (const c of step.conds) {
                        if (c.action !== "loop" || !c.distinct || !c.target) continue;
                        const takes = path.flatMap((v, k) => (v.c?.id === c.id ? [k] : []));
                        if (!takes.length) continue;
                        const first = takes[0];
                        const last = takes[takes.length - 1];
                        const seg = path.slice(first, last + 1);
                        // another loop in between ends the run: its rounds are not checked
                        if (seg.some((v) => v.c?.action === "loop" && v.c.id !== c.id)) continue;
                        const t = path.slice(0, first).filter((v) => v.c && flow.steps[v.i].id === c.target && v.c.action !== "loop");
                        const seq = [...t.slice(-1), ...seg.filter((v) => v.c && flow.steps[v.i].id === c.target && v.c.action !== "loop")].map(
                            (v) => v.c!.id
                        );
                        assert.equal(new Set(seq).size, seq.length, `distinct ${c.id} repeats a choice at ${c.target}: ${seq.join(",")}`);
                    }
                }
            }
        }),
        { numRuns: RUNS }
    );
});

test("CALC-90 to CALC-92 (property): the decision table has a column for every scenario of the mode, marks only what the path takes", () => {
    fc.assert(
        fc.property(small, fc.constantFrom("all", "pair", "min") as fc.Arbitrary<"all" | "pair" | "min">, (flow, mode) => {
            const list = pick(generate(flow, 1000, 1e9), mode);
            const dt = buildDecisionTable(flow, list);
            // CALC-91: a column for each scenario, Happy first
            assert.equal(dt.columns.length, list.length);
            const firstNeg = dt.columns.findIndex((c) => c.type === "neg");
            assert.ok(firstNeg === -1 || dt.columns.slice(firstNeg).every((c) => c.type === "neg"));
            assert.equal(dt.success, firstNeg === -1 ? dt.columns.length : firstNeg);
            // CALC-90: every step, in flow order, with one value for each choice (or itself)
            assert.deepEqual(
                dt.conditions.map((c) => [c.step, c.values.length]),
                flow.steps.map((s, i) => [i, Math.max(1, s.conds.length)])
            );
            const byId = new Map(list.map((s) => [s.id, s]));
            dt.columns.forEach((col, k) => {
                const sc = byId.get(col.id)!;
                // CALC-92: a mark is a choice on the path, or a passed step without choices
                dt.conditions.forEach((cd, ci) =>
                    cd.values.forEach((v, vi) => {
                        const takes = sc.path.some((p) => p.i === cd.step && (v.id === null || p.c?.id === v.id));
                        assert.equal(dt.marks[ci][vi][k], takes, `${col.id} ${v.id}`);
                    })
                );
            });
        }),
        { numRuns: RUNS }
    );
});
