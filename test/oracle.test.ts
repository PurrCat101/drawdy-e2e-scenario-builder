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

function randomFlow(r: ReturnType<typeof rng>): Flow {
    const n = r.int(2, 5);
    const steps: Flow["steps"] = [];
    for (let i = 0; i < n; i++) {
        const conds: Cond[] = [];
        const k = r.next() < 0.15 ? 0 : r.int(1, 3);
        for (let c = 0; c < k; c++) {
            const x = r.next();
            const action = x < 0.2 ? "end" : x < 0.35 && i > 0 ? "loop" : "next";
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
