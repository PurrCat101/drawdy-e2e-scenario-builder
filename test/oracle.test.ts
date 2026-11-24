// Checks the path generator against a second, independent enumerator on many
// random flows. The enumerator below does not share code with src/scenarios.ts:
// it walks with an explicit stack and has its own reading of sets / needs. It
// catches an implementation slip (a path lost or counted twice, a mode that drops
// a choice). It cannot tell whether the rules are the ones you meant; the README's
// "How the scenarios are counted" states those rules.

import assert from "node:assert/strict";
import { test } from "node:test";
import { generate, pick } from "../src/scenarios.ts";
import type { Cond, Flow } from "../src/flow.ts";

/* a small seeded random generator, so a failure can be reproduced */
function rng(seed: number) {
    let s = seed >>> 0;
    const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const int = (a: number, b: number) => a + Math.floor(next() * (b - a + 1));
    return { next, int };
}

const TAGS = ["t1", "t2", "t3"];

function randomFlow(r: ReturnType<typeof rng>, loops = true): Flow {
    const n = r.int(2, 5);
    const steps: Flow["steps"] = [];
    for (let i = 0; i < n; i++) {
        const conds: Cond[] = [];
        const k = r.next() < 0.15 ? 0 : r.int(1, 3);
        for (let c = 0; c < k; c++) {
            const x = r.next();
            const action = x < 0.2 ? "end" : loops && x < 0.35 && i > 0 ? "loop" : "next";
            const lit = () => (r.next() < 0.3 ? "!" : "") + TAGS[r.int(0, 2)];
            let need = "";
            if (r.next() < 0.25) {
                const a = lit();
                const b = lit();
                need = r.next() < 0.5 ? a : r.next() < 0.5 ? `${a},${b}` : `${a}|${b}`;
            }
            conds.push({
                id: `s${i}c${c}`,
                label: `L${i}${c}`,
                neg: action === "end",
                action,
                target: action === "loop" ? `s${r.int(0, i)}` : null,
                max: r.int(1, 3),
                tags: r.next() < 0.3 ? TAGS[r.int(0, 2)] : "",
                need,
                pri: "",
                variant: r.next() < 0.3,
            });
        }
        steps.push({ id: `s${i}`, name: `S${i}`, conds });
    }
    return { steps };
}

/** Every path, as "step:choice>step:choice>…"; null when there are more than `limit`. */
function enumerate(flow: Flow, limit = 1000): string[] | null {
    const steps = flow.steps;
    const at = new Map(steps.map((s, i) => [s.id, i] as const));
    // "," = and, "|" = or, a leading "!" = not
    const ok = (need: string, tags: Set<string>) =>
        !need ||
        need.split(",").every((term) =>
            term.split("|").some((lit) => {
                lit = lit.trim();
                return lit.startsWith("!") ? !tags.has(lit.slice(1)) : tags.has(lit);
            })
        );
    type Frame = { i: number; path: string[]; used: Map<string, number>; tags: Set<string> };
    const stack: Frame[] = [{ i: 0, path: [], used: new Map(), tags: new Set() }];
    const done: string[] = [];
    while (stack.length) {
        const f = stack.pop()!;
        if (f.i >= steps.length) {
            done.push(f.path.join(">"));
            if (done.length > limit) return null;
            continue;
        }
        const s = steps[f.i];
        if (!s.conds.length) {
            stack.push({ ...f, i: f.i + 1, path: [...f.path, `${f.i}:-`] });
            continue;
        }
        for (const c of s.conds) {
            if (!ok(c.need, f.tags)) continue;
            const path = [...f.path, `${f.i}:${c.id}`];
            const tags = new Set(f.tags);
            c.tags.split(",").filter(Boolean).forEach((t) => tags.add(t));
            if (c.action === "end") {
                done.push(path.join(">"));
                if (done.length > limit) return null;
            } else if (c.action === "loop") {
                const used = new Map(f.used);
                const u = used.get(c.id) ?? 0;
                if (u >= c.max) continue; // used up: no longer offered
                used.set(c.id, u + 1);
                stack.push({ i: at.get(c.target!)!, path, used, tags });
            } else stack.push({ i: f.i + 1, path, used: f.used, tags });
        }
    }
    return done;
}

test("the generator lists the same paths as an independent enumerator (random flows)", () => {
    const r = rng(20261124);
    let compared = 0;
    for (let n = 0; n < 1500; n++) {
        const flow = randomFlow(r);
        const want = enumerate(flow);
        if (!want) continue; // more than 1,000 paths: the generator stops there by design
        compared++;
        const g = generate(flow);
        const got = g.list.map((sc) => sc.path.map((v) => `${v.i}:${v.c ? v.c.id : "-"}`).join(">"));
        const label = JSON.stringify(flow.steps.map((s) => s.conds.map((c) => [c.action, c.target, c.max, c.tags, c.need])));
        assert.equal(new Set(got).size, got.length, "no path twice: " + label);
        assert.deepEqual([...got].sort(), [...want].sort(), "same paths: " + label);
        const ends = want.filter((p) => {
            const [i, id] = p.split(">").pop()!.split(":");
            return id !== "-" && flow.steps[+i].conds.find((c) => c.id === id)!.action === "end";
        }).length;
        assert.equal(g.list.filter((sc) => sc.type === "neg").length, ends, "negative = ends on an end: " + label);
    }
    assert.ok(compared > 1000, "enough flows were small enough to compare: " + compared);
});

test("EP, Pair and Each only choose from All, and keep every choice and pair All can reach", () => {
    const r = rng(77);
    const idsOf = (list: { path: { c: Cond | null }[] }[]) => {
        const x = new Set<string>();
        list.forEach((sc) => sc.path.forEach((v) => v.c && x.add(v.c.id)));
        return x;
    };
    const pairsOf = (list: { path: { c: Cond | null }[] }[]) => {
        const x = new Set<string>();
        list.forEach((sc) => {
            const a = [...new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))].sort();
            for (let p = 0; p < a.length; p++) for (let q = p + 1; q < a.length; q++) x.add(a[p] + "&" + a[q]);
        });
        return x;
    };
    let checked = 0;
    for (let n = 0; n < 1000; n++) {
        const g = generate(randomFlow(r));
        if (!g.list.length || g.capped) continue;
        checked++;
        const all = idsOf(g.list);
        for (const mode of ["ep", "pair", "min"] as const) {
            const sel = pick(g, mode);
            assert.ok(sel.every((sc) => g.list.includes(sc)), mode + ": only scenarios that All lists");
            assert.equal(new Set(sel).size, sel.length, mode + ": none twice");
            const got = idsOf(sel);
            for (const id of all) assert.ok(got.has(id), `${mode}: choice ${id} is still covered`);
        }
        const got = pairsOf(pick(g, "pair"));
        for (const p of pairsOf(g.list)) assert.ok(got.has(p), `pair: ${p} is still covered`);
    }
    assert.ok(checked > 500, "enough flows: " + checked);
});

test("distinct matches the closed form: picking k items over at most m+1 rounds gives sum of C(k, r)", () => {
    const C = (n: number, k: number) => {
        let x = 1;
        for (let i = 1; i <= k; i++) x = (x * (n - k + i)) / i;
        return Math.round(x);
    };
    const cond = (id: string, over: Partial<Cond> = {}): Cond => ({
        id, label: id, neg: false, action: "next", target: null, max: 1, tags: "", need: "", pri: "", variant: false, ...over,
    });
    for (let k = 1; k <= 5; k++)
        for (let m = 1; m <= 4; m++) {
            const flow: Flow = {
                steps: [
                    { id: "a", name: "pick", conds: Array.from({ length: k }, (_, j) => cond("p" + j)) },
                    { id: "b", name: "more", conds: [cond("again", { action: "loop", target: "a", max: m, distinct: true }), cond("done")] },
                ],
            };
            let want = 0;
            for (let r = 1; r <= Math.min(k, m + 1); r++) want += C(k, r);
            assert.equal(generate(flow).list.length, want, `k=${k} items, max ${m}`);
        }
});

test("distinct, in general: sum over r of C(k, r) * q^r (plain loop: sum over r of (k*q)^r)", () => {
    // k choices at the step the loop goes back to, q ways through the steps between it
    // and the loop, m = max. A scenario is r passes (r from 1 to m+1).
    const C = (n: number, k: number) => {
        let x = 1;
        for (let i = 1; i <= k; i++) x = (x * (n - k + i)) / i;
        return Math.round(x);
    };
    const c = (id: string, over: Partial<Cond> = {}): Cond => ({
        id, label: id, neg: false, action: "next", target: null, max: 1, tags: "", need: "", pri: "", variant: false, ...over,
    });
    const build = (k: number, q: number, m: number, distinct: boolean): Flow => ({
        steps: [
            { id: "a", name: "pick", conds: Array.from({ length: k }, (_, j) => c("p" + j)) },
            { id: "mid", name: "between", conds: Array.from({ length: q }, (_, j) => c("q" + j)) },
            { id: "b", name: "more", conds: [c("again", { action: "loop", target: "a", max: m, distinct }), c("done")] },
        ],
    });
    for (let k = 1; k <= 4; k++)
        for (let q = 1; q <= 3; q++)
            for (let m = 1; m <= 3; m++) {
                let withDistinct = 0;
                for (let r = 1; r <= Math.min(k, m + 1); r++) withDistinct += C(k, r) * q ** r;
                let plain = 0;
                for (let r = 1; r <= m + 1; r++) plain += (k * q) ** r;
                assert.equal(generate(build(k, q, m, true), 1e6).list.length, withDistinct, `distinct k=${k} q=${q} m=${m}`);
                assert.equal(generate(build(k, q, m, false), 1e6).list.length, plain, `plain k=${k} q=${q} m=${m}`);
            }
});

test("lower bounds for the size of Each and Pair (flows without loops)", () => {
    const r = rng(4242);
    let checked = 0;
    for (let n = 0; n < 1500; n++) {
        const g = generate(randomFlow(r, false));
        if (g.list.length < 2 || g.capped) continue;
        checked++;
        // Each: a scenario holds at most `widest` choices, so at least |choices| / widest scenarios
        const all = new Set<string>();
        let widest = 0;
        g.list.forEach((sc) => {
            const ids = new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id));
            ids.forEach((id) => all.add(id));
            widest = Math.max(widest, ids.size);
        });
        assert.ok(pick(g, "min").length >= Math.ceil(all.size / widest), "each: lower bound");
        // Pair: a scenario takes one choice per step, so it meets one pair of choices for any
        // two steps; every pair that can meet between two steps needs its own scenario
        const meet = new Map<string, Set<string>>();
        g.list.forEach((sc) => {
            const at = sc.path.filter((v) => v.c);
            for (let a = 0; a < at.length; a++)
                for (let b = a + 1; b < at.length; b++) {
                    const key = at[a].i + "/" + at[b].i;
                    if (!meet.has(key)) meet.set(key, new Set());
                    meet.get(key)!.add(at[a].c!.id + "&" + at[b].c!.id);
                }
        });
        const most = Math.max(0, ...[...meet.values()].map((x) => x.size));
        assert.ok(pick(g, "pair").length >= most, `pair: at least ${most}`);
    }
    assert.ok(checked > 600, "enough flows: " + checked);
});

/* --------------------------- past the 1,000 limit --------------------------- */

function bigFlow(r: ReturnType<typeof rng>): Flow {
    const n = r.int(6, 9);
    const steps: Flow["steps"] = [];
    for (let i = 0; i < n; i++) {
        const conds: Cond[] = [];
        const k = r.int(2, 4);
        for (let c = 0; c < k; c++) {
            const x = r.next();
            const action = x < 0.12 ? "end" : x < 0.2 && i > 0 ? "loop" : "next";
            const lit = () => (r.next() < 0.3 ? "!" : "") + TAGS[r.int(0, 2)];
            conds.push({
                id: `s${i}c${c}`,
                label: `L${i}${c}`,
                neg: action === "end",
                action,
                target: action === "loop" ? `s${r.int(Math.max(0, i - 2), i)}` : null,
                max: r.int(1, 2),
                tags: r.next() < 0.25 ? TAGS[r.int(0, 2)] : "",
                need: r.next() < 0.2 ? lit() : "",
                pri: "",
                variant: r.next() < 0.3,
            });
        }
        steps.push({ id: `s${i}`, name: `S${i}`, conds });
    }
    return { steps };
}

test("past the limit, every mode still covers every choice and pair that can happen", () => {
    const r = rng(9001);
    let checked = 0;
    for (let n = 0; n < 120 && checked < 25; n++) {
        const flow = bigFlow(r);
        const g = generate(flow);
        if (!g.capped) continue;
        const every = enumerate(flow, 300000);
        if (!every) continue; // too big to check against the enumerator
        checked++;
        const valid = new Set(every);
        const key = (p: { i: number; c: Cond | null }[]) => p.map((v) => `${v.i}:${v.c ? v.c.id : "-"}`).join(">");
        // every scenario, the added ones too, is a path the flow allows
        for (const sc of g.list) assert.ok(valid.has(key(sc.path)), "a real path: " + key(sc.path));
        // what can happen, from the full enumeration
        const can = new Set<string>();
        const canPair = new Set<string>();
        for (const p of every) {
            const ids = [...new Set(p.split(">").map((t) => t.split(":")[1]).filter((x) => x !== "-"))].sort();
            ids.forEach((id) => can.add(id));
            for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) canPair.add(ids[a] + "&" + ids[b]);
        }
        assert.deepEqual(
            [...(g.unreachable ?? [])].sort(),
            flow.steps.flatMap((s) => s.conds.map((c) => c.id)).filter((id) => !can.has(id)).sort(),
            "unreachable = what no path takes"
        );
        for (const mode of ["ep", "pair", "min"] as const) {
            const got = new Set<string>();
            pick(g, mode).forEach((sc) => sc.path.forEach((v) => v.c && got.add(v.c.id)));
            for (const id of can) assert.ok(got.has(id), `${mode} covers ${id}`);
        }
        if (g.pairsComplete) {
            const got = new Set<string>();
            pick(g, "pair").forEach((sc) => {
                const ids = [...new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))].sort();
                for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) got.add(ids[a] + "&" + ids[b]);
            });
            for (const p of canPair) assert.ok(got.has(p), "pair covers " + p);
        }
    }
    assert.ok(checked >= 10, "enough big flows: " + checked);
});
