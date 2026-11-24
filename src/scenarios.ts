// Scenario generation, ported from the E2E Scenario Builder artifact.
// Pure logic, no DOM, no Drawdy imports.

import type { Cond, Flow, Mode, Step } from "./flow";

export type PathItem = { i: number; c: Cond | null };

export type Scenario = {
    /** 1-based order in the full (unfiltered) list */
    n: number;
    /** TSS-04821 (success) / TSN-00317 (negative): stable, see stableIds */
    id: string;
    path: PathItem[];
    type: "happy" | "neg";
    loops: number;
    pri: number;
    /** scenarios collapsed into this one by EP */
    covers?: Scenario[];
};

export type Generated = {
    list: Scenario[];
    /** the walk stopped at the limit: `list` holds the first paths walked, plus `extra` */
    capped: boolean;
    /** scenarios added after the limit so every choice (and pair) is in at least one */
    extra?: number;
    /** when capped: false if the search for the missing pairs ran out of time */
    pairsComplete?: boolean;
    /** condition ids no path can take (needs / loops rule them out), when known */
    unreachable?: string[];
    /** false when the search past the limit stopped at its time budget */
    searchComplete?: boolean;
};

export type Issue = { lv: "err" | "warn"; msg: string };

const tokens = (s: string) =>
    String(s || "")
        .toLowerCase()
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

type Tags = Record<string, 1>;

function needOk(c: Cond, tags: Tags): boolean {
    return tokens(c.need).every((term) =>
        term.split("|").some((l) => {
            l = l.trim();
            return l[0] === "!" ? !tags[l.slice(1).trim()] : !!tags[l];
        })
    );
}

function withTags(tags: Tags, c: Cond): Tags {
    const t = tokens(c.tags);
    if (!t.length) return tags;
    const n = { ...tags };
    t.forEach((x) => {
        n[x] = 1;
    });
    return n;
}

/** A label for a happy scenario that passes a `[negative]` choice and still completes. */
export const VIA_NEGATIVE = "via negative";

/** Does the path take a failing choice that does not end the flow? */
export function passesNegative(path: PathItem[]): boolean {
    return path.some((v) => v.c && v.c.neg && v.c.action !== "end");
}

/** Happy = reaches the end (loops allowed); Negative = ends on an "end" cond. */
function classify(path: PathItem[]): "happy" | "neg" {
    const last = path[path.length - 1];
    return last && last.c && last.c.action === "end" ? "neg" : "happy";
}

/** Highest P number among the conditions on the path; none set = P2. */
function priOf(path: PathItem[]): number {
    let m = 0;
    path.forEach((v) => {
        const p = parseInt(v.c?.pri ?? "", 10);
        if (p > m) m = p;
    });
    return m || 2;
}

/**
 * A path's identity with the rounds of every `distinct` loop put in a fixed order,
 * so picking A then B and B then A give the same key. A round runs from the step
 * the loop goes back to up to (not including) the loop's own step; the last round
 * of a run ends at the choice that leaves the loop step. A round cut short by an
 * end stays last.
 */
function orderFreeKey(path: PathItem[], idx: Record<string, number>): string {
    const tok = (v: PathItem) => v.i + ":" + (v.c ? v.c.id : "-");
    const out: string[] = [];
    let j = 0;
    while (j < path.length) {
        let e = j;
        while (e < path.length && !(path[e].c?.action === "loop" && path[e].c!.distinct)) e++;
        if (e >= path.length) {
            for (; j < path.length; j++) out.push(tok(path[j]));
            break;
        }
        const L = path[e].c!;
        const t = L.target ? idx[L.target] : -1;
        const s = path[e].i;
        if (!(t >= 0 && t < s)) {
            for (; j <= e; j++) out.push(tok(path[j]));
            continue;
        }
        let start = e;
        while (start > j && path[start].i !== t) start--;
        for (; j < start; j++) out.push(tok(path[j]));
        const rounds: string[] = [path.slice(start, e).map(tok).join(",")];
        let tail = "";
        let k = e + 1;
        for (;;) {
            let m = k;
            while (m < path.length && path[m].i !== s) m++;
            if (m >= path.length) {
                tail = path.slice(k).map(tok).join(",");
                k = path.length;
                break;
            }
            rounds.push(path.slice(k, m).map(tok).join(","));
            if (path[m].c && path[m].c!.id === L.id) {
                k = m + 1;
                continue;
            }
            k = m; // the choice that leaves the loop step is read as usual
            break;
        }
        rounds.sort();
        out.push("{" + rounds.join("|" + L.id + "|") + "}" + (tail ? "+" + tail : ""));
        j = k;
    }
    return out.join(" ");
}

/**
 * Scenario IDs that do not move when the flow changes elsewhere: the number comes
 * from a hash of what the scenario does (step names and the choices taken, in
 * order), so adding a choice, reordering lines or adding a step that a scenario does
 * not pass leaves its ID alone. Renaming a step or a choice it passes gives it a new
 * ID, as it is then a different test. Five digits; on a clash, the scenario whose
 * description sorts later moves to the next free number.
 */
function stableIds(paths: PathItem[][], steps: Step[]): string[] {
    const describe = (p: PathItem[]) =>
        p.map((v) => `${steps[v.i].name.trim().toLowerCase()}=${v.c ? v.c.label.trim().toLowerCase() : ""}`).join("\u241e");
    const hash = (str: string) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h % 100000;
    };
    const keys = paths.map((p) => ({ p, d: describe(p) }));
    const order = keys.map((k, i) => i).sort((a, b) => (keys[a].d < keys[b].d ? -1 : keys[a].d > keys[b].d ? 1 : a - b));
    const used = { happy: new Set<number>(), neg: new Set<number>() };
    const out: string[] = new Array(paths.length);
    for (const i of order) {
        const type = classify(keys[i].p);
        let n = hash(keys[i].d);
        while (used[type].has(n)) n = (n + 1) % 100000;
        used[type].add(n);
        out[i] = (type === "happy" ? "TSS-" : "TSN-") + String(n).padStart(5, "0");
    }
    return out;
}

/**
 * Every path of `flow` (up to `limit`), then, past the limit, a search for the
 * choices, loop ends and pairs those paths missed, within `budgetMs`.
 */
export function generate(flow: Flow, limit = 1000, budgetMs = 3000): Generated {
    const steps = flow.steps;
    const out: PathItem[][] = [];
    let capped = false;
    const idx: Record<string, number> = {};
    steps.forEach((s, i) => {
        idx[s.id] = i;
    });
    /** keep one path per set of distinct-loop rounds (the first one walked) */
    const dropReordered = (paths: PathItem[][]) => {
        if (!steps.some((s) => s.conds.some((c) => c.distinct))) return;
        const seen = new Set<string>();
        let w = 0;
        for (const p of paths) {
            const k = orderFreeKey(p, idx);
            if (seen.has(k)) continue;
            seen.add(k);
            paths[w++] = p;
        }
        paths.length = w;
    };

    /** distinct loops: the steps they go back to (only those steps' last pick matters) */
    const distinctTargets = new Set<number>();
    steps.forEach((s, i) =>
        s.conds.forEach((c) => {
            if (c.distinct && c.target && idx[c.target] !== undefined && idx[c.target] < i)
                distinctTargets.add(idx[c.target]);
        })
    );
    const condById = new Map<string, Cond>();
    steps.forEach((s) => s.conds.forEach((c) => condById.set(c.id, c)));

    /**
     * One path that takes every condition in `want` (and every loop in `wantMax` its
     * full `max` times), walking by the same rules as the full walk; null if none.
     * Used after the full walk stopped at the limit, to reach what it never got to.
     * Dead ends are remembered, so an impossible request does not walk every path.
     */
    function findPath(want: string[], wantMax: string[], deadline: number): PathItem[] | null | "timeout" {
        const dead = new Set<string>();
        let timedOut = false;
        const done = (path: PathItem[], usage: Record<string, number>) =>
            want.every((id) => path.some((v) => v.c && v.c.id === id)) &&
            wantMax.every((id) => (usage[id] || 0) === (condById.get(id)!.max || 1));
        function go(
            i: number,
            path: PathItem[],
            usage: Record<string, number>,
            tags: Tags,
            last: Record<number, number>,
            run: Run | null
        ): PathItem[] | null {
            if (timedOut || Date.now() > deadline) {
                timedOut = true;
                return null;
            }
            if (i >= steps.length) return done(path, usage) ? path : null;
            const taken = want.filter((id) => path.some((v) => v.c && v.c.id === id)).join(",");
            const lastKey = [...distinctTargets].map((t) => last[t] ?? "").join(",");
            const key = [i, Object.keys(tags).sort().join(","), JSON.stringify(usage), run ? JSON.stringify(run) : "", lastKey, taken].join("|");
            if (dead.has(key)) return null;
            const s = steps[i];
            const here = run && run.armed && run.t === i;
            const after = here ? { ...run!, armed: false } : run;
            let found: PathItem[] | null = null;
            if (!s.conds.length) found = go(i + 1, path.concat([{ i, c: null }]), usage, tags, last, after);
            else {
                // the wanted choices first: they are what the search is for
                const order = s.conds.map((c, k) => k).sort((x, y) => {
                    const w = (k: number) => (want.includes(s.conds[k].id) || wantMax.includes(s.conds[k].id) ? 0 : 1);
                    return w(x) - w(y);
                });
                for (const k of order) {
                    const c = s.conds[k];
                    if (!needOk(c, tags)) continue;
                    if (here && c.action === "next" && run!.picks.includes(k)) continue;
                    const p = path.concat([{ i, c }]);
                    const nt = withTags(tags, c);
                    if (c.action === "end") found = done(p, usage) ? p : null;
                    else if (c.action === "loop") {
                        const u = usage[c.id] || 0;
                        const t = c.target ? idx[c.target] : undefined;
                        if (u >= (c.max || 1) || t === undefined) continue;
                        let r: Run | null = null;
                        if (c.distinct && t < i) {
                            const before = after && after.loop === c.id ? after.picks : [];
                            const pick = last[t];
                            r = { loop: c.id, t, picks: pick === undefined ? before : [...before, pick], armed: true };
                        }
                        found = go(t, p, { ...usage, [c.id]: u + 1 }, nt, last, r);
                    } else found = go(i + 1, p, usage, nt, { ...last, [i]: k }, after);
                    if (found) break;
                }
            }
            if (!found && !timedOut) dead.add(key);
            return found;
        }
        const r = go(0, [], {}, {}, {}, null);
        return r ?? (timedOut ? "timeout" : null);
    }

    /**
     * A `distinct` loop in progress: the step it goes back to (`t`), the choices
     * taken there in the rounds so far, and whether the round being walked has not
     * yet passed `t` (only then are those choices held back).
     */
    type Run = { loop: string; t: number; picks: number[]; armed: boolean };

    function walk(
        i: number,
        path: PathItem[],
        usage: Record<string, number>,
        tags: Tags,
        /** per step: the index of the last "next" choice taken there on this path */
        last: Record<number, number> = {},
        run: Run | null = null
    ) {
        if (out.length >= limit) {
            capped = true;
            return;
        }
        if (i >= steps.length) {
            out.push(path);
            return;
        }
        const s = steps[i];
        // past the step a distinct loop went back to: the next round may pick freely
        // there again only after the loop is taken once more
        const here = run && run.armed && run.t === i;
        const after = here ? { ...run!, armed: false } : run;
        if (!s.conds.length) {
            walk(i + 1, path.concat([{ i, c: null }]), usage, tags, last, after);
            return;
        }
        for (let k = 0; k < s.conds.length; k++) {
            const c = s.conds[k];
            if (!needOk(c, tags)) continue;
            // a distinct round: a choice taken in an earlier round is not offered
            // again (ends and loops are). The order of picks is dropped afterwards.
            if (here && c.action === "next" && run!.picks.includes(k)) continue;
            const p = path.concat([{ i, c }]);
            const nt = withTags(tags, c);
            if (c.action === "end") {
                if (out.length >= limit) {
                    capped = true;
                    return;
                }
                out.push(p);
                continue;
            }
            if (c.action === "loop") {
                const u = usage[c.id] || 0;
                const t = c.target ? idx[c.target] : undefined;
                if (u >= (c.max || 1) || t === undefined) continue;
                let r: Run | null = null; // any other loop ends a distinct run
                if (c.distinct && t < i) {
                    const before = after && after.loop === c.id ? after.picks : [];
                    const pick = last[t];
                    r = {
                        loop: c.id,
                        t,
                        picks: pick === undefined ? before : [...before, pick],
                        armed: true,
                    };
                }
                walk(t, p, { ...usage, [c.id]: u + 1 }, nt, last, r);
                continue;
            }
            walk(i + 1, p, usage, nt, { ...last, [i]: k }, after);
        }
    }
    walk(0, [], {}, {});
    dropReordered(out);

    // Past the limit, the walk never got to some paths, so some choices (and pairs)
    // would be in no scenario, and no mode could pick them. Look for one path for
    // each of those, so every mode still covers every choice it can.
    let extra = 0;
    let pairsComplete = true;
    let unreachable: string[] | undefined;
    let searchComplete = true;
    if (capped) {
        const deadline = Date.now() + budgetMs;
        const has = (p: PathItem[], id: string) => p.some((v) => v.c && v.c.id === id);
        const add = (p: PathItem[]) => {
            out.push(p);
            extra++;
        };
        unreachable = [];
        for (const id of condById.keys()) {
            if (out.some((p) => has(p, id))) continue;
            const p = findPath([id], [], deadline);
            if (p === "timeout") {
                searchComplete = false;
                break;
            }
            if (p) add(p);
            else unreachable.push(id);
        }
        // loops at their full max (the last round they allow)
        for (const [id, c] of condById) {
            if (c.action !== "loop" || (c.max || 1) < 2) continue;
            const full = (p: PathItem[]) => p.filter((v) => v.c && v.c.id === id).length === c.max;
            if (out.some(full)) continue;
            const p = findPath([id], [id], deadline);
            if (p === "timeout") searchComplete = false;
            else if (p) add(p);
        }
        // every pair of choices that can share a path
        const ids = [...condById.keys()].filter((id) => !unreachable!.includes(id));
        const seen = new Set<string>();
        out.forEach((p) => {
            const a = [...new Set(p.filter((v) => v.c).map((v) => v.c!.id))].sort();
            for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) seen.add(a[x] + "&" + a[y]);
        });
        outer: for (let x = 0; x < ids.length; x++)
            for (let y = x + 1; y < ids.length; y++) {
                const [a, b] = [ids[x], ids[y]].sort();
                if (seen.has(a + "&" + b)) continue;
                const p = findPath([a, b], [], deadline);
                if (p === "timeout") {
                    pairsComplete = false;
                    searchComplete = false;
                    break outer;
                }
                if (!p) continue;
                add(p);
                const q = [...new Set(p.filter((v) => v.c).map((v) => v.c!.id))].sort();
                for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) seen.add(q[i] + "&" + q[j]);
            }
    }

    const loopN = (p: PathItem[]) =>
        p.filter((v) => v.c && v.c.action === "loop").length;
    // no loops first, then the longest path first (happy path is case 1)
    out.sort((a, b) => loopN(a) - loopN(b) || b.length - a.length);

    const ids = stableIds(out, steps);
    const list: Scenario[] = out.map((path, k) => ({
        n: k + 1,
        id: ids[k],
        path,
        type: classify(path),
        loops: loopN(path),
        pri: priOf(path),
    }));
    if (!capped) {
        const used = new Set<string>();
        out.forEach((p) => p.forEach((v) => v.c && used.add(v.c.id)));
        unreachable = [...condById.keys()].filter((id) => !used.has(id));
    }
    return { list, capped, extra, pairsComplete, unreachable, searchComplete };
}

/**
 * What a scenario covers on its own: its choices, plus "loop end" items, one per
 * loop with max 2 or more that the scenario takes its full max times. Every mode
 * covers all of these items that All has, so the last round a loop allows is
 * always tested (a loop with max 1 is covered by its choice already).
 */
export function singles(sc: Scenario): string[] {
    const n = new Map<string, number>();
    const out = new Set<string>();
    sc.path.forEach((v) => {
        if (!v.c) return;
        out.add(v.c.id);
        if (v.c.action === "loop") n.set(v.c.id, (n.get(v.c.id) || 0) + 1);
    });
    n.forEach((k, id) => {
        const c = sc.path.find((v) => v.c && v.c.id === id)!.c!;
        if ((c.max || 1) >= 2 && k === c.max) out.add("end:" + id);
    });
    return [...out];
}

/**
 * Equivalence partitioning: a condition marked `variant` (and not used as a
 * tag by anyone) does not make a case different, so scenarios that differ only in
 * those choices keep a single representative. Every condition stays covered.
 */
export function dedupe(list: Scenario[]): Scenario[] {
    const relevant = (sc: Scenario) => {
        const r: Record<string, 1> = {};
        sc.path.forEach((v) => {
            if (v.c)
                tokens(v.c.need).forEach((t) =>
                    t.split("|").forEach((l) => {
                        l = l.trim().replace(/^!/, "");
                        if (l) r[l] = 1;
                    })
                );
        });
        return r;
    };
    // which paths each kept scenario stands for; kept apart from the scenarios
    // themselves, so picking EP never changes what All or another mode returns
    const covers = new Map<Scenario, Scenario[]>();
    const seen: Record<string, Scenario> = {};
    const keep: Scenario[] = [];
    list.forEach((sc) => {
        const rel = relevant(sc);
        const sig = sc.path
            .filter(
                (v) =>
                    v.c &&
                    !(v.c.variant && !tokens(v.c.tags).some((t) => rel[t]))
            )
            .map((v) => v.i + ":" + (v.c ? v.c.id : "-"))
            .sort()
            .join("|");
        if (!seen[sig]) {
            seen[sig] = sc;
            covers.set(sc, []);
            keep.push(sc);
        } else covers.get(seen[sig])!.push(sc);
    });
    const cov = new Set<string>();
    keep.forEach((sc) => singles(sc).forEach((x) => cov.add(x)));
    const ids: string[] = [];
    list.forEach((sc) =>
        singles(sc).forEach((x) => {
            if (ids.indexOf(x) < 0) ids.push(x);
        })
    );
    ids.forEach((id) => {
        if (cov.has(id)) return;
        let best: Scenario | null = null;
        const rank = (s: Scenario) => [
            s.type === "happy" ? 0 : 1,
            s.pri,
            s.loops,
            s.path.length,
        ];
        list.forEach((sc) => {
            if (!singles(sc).includes(id)) return;
            if (!best) {
                best = sc;
                return;
            }
            const a = rank(sc);
            const b = rank(best);
            for (let k = 0; k < a.length; k++) {
                if (a[k] !== b[k]) {
                    if (a[k] < b[k]) best = sc;
                    return;
                }
            }
        });
        if (best) {
            const b = best as Scenario;
            keep.push(b);
            singles(b).forEach((x) => cov.add(x));
        }
    });
    const keptIds = new Set(keep.map((s) => s.id));
    return Array.from(new Set(keep))
        .sort((a, b) => a.n - b.n)
        .map((sc) => ({ ...sc, covers: (covers.get(sc) || []).filter((o) => !keptIds.has(o.id)) }));
}

/**
 * Each-choice (1-wise): a small set of scenarios that touch every condition. A greedy
 * cover that prefers readable scenarios (Happy paths first, then paths with at most one
 * failing choice, then any), so it is complete but not always the smallest possible.
 */
export function minimal(list: Scenario[]): Scenario[] {
    const all = new Set<string>();
    list.forEach((sc) => singles(sc).forEach((x) => all.add(x)));
    const negN = (sc: Scenario) => sc.path.filter((v) => v.c && v.c.neg).length;
    const chosen: Scenario[] = [];
    const cov = new Set<string>();
    const add = (sc: Scenario) => {
        chosen.push(sc);
        singles(sc).forEach((x) => cov.add(x));
    };
    const fill = (pool: Scenario[]) => {
        while (cov.size < all.size) {
            let best: Scenario | null = null;
            let bs = 0;
            for (const sc of pool) {
                if (chosen.indexOf(sc) >= 0) continue;
                const n = singles(sc).filter((x) => !cov.has(x)).length;
                if (
                    n > bs ||
                    (n === bs &&
                        n > 0 &&
                        best &&
                        (sc.pri < best.pri ||
                            (sc.pri === best.pri &&
                                sc.path.length < best.path.length)))
                ) {
                    best = sc;
                    bs = n;
                }
            }
            if (!best) break;
            add(best);
        }
    };
    const happy = list.find((sc) => sc.type === "happy");
    if (happy) add(happy);
    fill(list.filter((sc) => sc.type === "happy"));
    fill(list.filter((sc) => negN(sc) <= 1));
    fill(list);
    return chosen.sort((a, b) => a.n - b.n);
}

/**
 * Pairwise (2-wise): every condition, and every pair of conditions that can share a
 * path, is covered. A plain greedy set cover (most uncovered first, ties: higher
 * priority, then shorter), so it is complete but not always the smallest possible.
 */
export function pairwise(list: Scenario[]): Scenario[] {
    const items = (sc: Scenario) => {
        const ids = Array.from(
            new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))
        ).sort();
        const out: string[] = singles(sc);
        for (let a = 0; a < ids.length; a++)
            for (let b = a + 1; b < ids.length; b++)
                out.push(ids[a] + "&" + ids[b]);
        return out;
    };
    // items as numbers, covered as a bit per item: the greedy loop below looks at
    // every scenario in every round, so it must not compare strings
    const index = new Map<string, number>();
    const per: Int32Array[] = list.map((sc) => {
        const its = items(sc);
        const out = new Int32Array(its.length);
        its.forEach((x, k) => {
            let n = index.get(x);
            if (n === undefined) index.set(x, (n = index.size));
            out[k] = n;
        });
        return out;
    });
    const covered = new Uint8Array(index.size);
    let left = index.size;
    const taken = new Uint8Array(list.length);
    const chosen: number[] = [];
    while (left > 0) {
        let best = -1;
        let bs = 0;
        for (let k = 0; k < per.length; k++) {
            if (taken[k]) continue;
            const a = per[k];
            let n = 0;
            for (let j = 0; j < a.length; j++) if (!covered[a[j]]) n++;
            if (
                n > bs ||
                (n === bs &&
                    n > 0 &&
                    best >= 0 &&
                    (list[k].pri < list[best].pri ||
                        (list[k].pri === list[best].pri &&
                            list[k].path.length < list[best].path.length)))
            ) {
                best = k;
                bs = n;
            }
        }
        if (best < 0) break;
        chosen.push(best);
        taken[best] = 1;
        for (const x of per[best]) if (!covered[x]) {
            covered[x] = 1;
            left--;
        }
    }
    return chosen.map((k) => list[k]).sort((a, b) => a.n - b.n);
}

export function pick(g: Generated, mode: Mode): Scenario[] {
    switch (mode) {
        case "all":
            return g.list;
        case "pair":
            return pairwise(g.list);
        case "min":
            return minimal(g.list);
        default:
            return dedupe(g.list);
    }
}

/**
 * One line that suggests a mode for this flow, from its counts. Every mode covers
 * every choice and loop end; they differ in what else they promise and in size.
 */
export function modeTip(flow: Flow, counts: { all: number; ep: number; pair: number; min: number }): string {
    const variant = flow.steps.some((st) => st.conds.some((c) => c.variant));
    if (counts.all <= 30) return `TIP: All has only ${counts.all} scenarios: run them all.`;
    if (!variant)
        return `TIP: no choice is marked [variant], so EP (${counts.ep}) stays close to All. Use Pair (${counts.pair}) to cover every pair of choices, or Each (${counts.min}) for a quick pass; mark interchangeable choices [variant] to make EP useful.`;
    return `TIP: EP (${counts.ep}) for regression by your [variant] groups; Pair (${counts.pair}) when choices at different steps affect each other; Each (${counts.min}) for a quick smoke pass.`;
}

/** Flow sanity checks (trimmed port: no expected-result / priority notes). */
export function validate(flow: Flow, g: Generated): Issue[] {
    const R: Issue[] = [];
    const steps = flow.steps;
    const idx: Record<string, number> = {};
    steps.forEach((s, i) => {
        idx[s.id] = i;
    });
    const provided: Record<string, 1> = {};
    steps.forEach((s) =>
        s.conds.forEach((c) =>
            tokens(c.tags).forEach((t) => {
                provided[t] = 1;
            })
        )
    );
    const used = new Set<string>();
    const reached = new Set<number>();
    g.list.forEach((sc) =>
        sc.path.forEach((v) => {
            reached.add(v.i);
            if (v.c) used.add(v.c.id);
        })
    );
    if (!steps.length) return [{ lv: "err", msg: "No steps" }];
    if (!g.list.length)
        R.push({
            lv: "err",
            msg: "No scenarios: every path is cut by a need rule, or the flow never ends",
        });
    steps.forEach((s: Step, i) => {
        const nm = `${i + 1}. ${s.name || "(no name)"}`;
        if (g.list.length && !reached.has(i))
            R.push({ lv: "err", msg: `${nm}: no scenario reaches this step` });
        if (
            s.conds.length &&
            !s.conds.some((c) => c.action === "next") &&
            i < steps.length - 1
        )
            R.push({
                lv: "warn",
                msg: `${nm}: no condition continues to the next step`,
            });
        const seen: Record<string, 1> = {};
        s.conds.forEach((c) => {
            const lb = c.label.trim();
            const cn = `${nm} > ${lb || "(no label)"}`;
            if (!lb) R.push({ lv: "err", msg: `${nm}: a condition has no label` });
            else {
                if (seen[lb])
                    R.push({ lv: "warn", msg: `${nm}: duplicate condition "${lb}"` });
                seen[lb] = 1;
            }
            if (c.action === "loop" && c.target !== null) {
                if (idx[c.target] === undefined)
                    R.push({ lv: "err", msg: `${cn}: loops to a missing step` });
                else if (idx[c.target] > i)
                    R.push({ lv: "warn", msg: `${cn}: loop points forward (acts as a skip)` });
            }
            if (c.action === "loop" && c.distinct) {
                const t = c.target !== null ? idx[c.target] : undefined;
                const picks = t === undefined ? 0 : steps[t].conds.filter((x) => x.action === "next").length;
                if (t === undefined || t >= i)
                    R.push({ lv: "warn", msg: `${cn}: distinct only works on a loop back to an earlier step; it does nothing here` });
                else if (!picks)
                    R.push({ lv: "warn", msg: `${cn}: distinct does nothing: step ${t + 1} has no choices to hold back` });
                else if ((c.max || 1) + 1 > picks)
                    R.push({
                        lv: "warn",
                        msg: `${cn}: max ${c.max || 1} asks for ${(c.max || 1) + 1} different picks at step ${t + 1}, which has ${picks}; rounds past that are skipped`,
                    });
            }
            tokens(c.need).forEach((t) =>
                t.split("|").forEach((l) => {
                    l = l.trim();
                    if (l && l[0] !== "!" && !provided[l])
                        R.push({
                            lv: "err",
                            msg: `${cn}: need "${l}" but no condition sets that tag`,
                        });
                })
            );
            if (g.list.length && !used.has(c.id))
                R.push(
                    !g.unreachable || g.unreachable.includes(c.id)
                        ? { lv: "err", msg: `${cn}: no path can take this choice (its needs, or the loops before it, rule it out)` }
                        : { lv: "err", msg: `${cn}: not in any scenario: the flow is too big to finish the search for it` }
                );
        });
    });
    if (g.capped) {
        const added = g.extra ? `, plus ${g.extra} found to cover the rest` : "";
        R.push({
            lv: "warn",
            msg:
                `More than 1,000 paths: All lists the first 1,000${added}. ` +
                (g.pairsComplete === false
                    ? "Every choice is covered, but not every pair (the search ran out of time). "
                    : "Every choice and every pair that can meet is in at least one scenario. ") +
                "EP may miss groups of paths beyond these. Use Pair or Each, or add sets / needs to cut paths that cannot happen.",
        });
    }
    return R.sort((a, b) => (a.lv === b.lv ? 0 : a.lv === "err" ? -1 : 1));
}
