// Scenario generation, ported from the E2E Scenario Builder artifact.
// Pure logic, no DOM, no Drawdy imports.

import type { Cond, Flow, Mode, Step } from "./flow";

export type PathItem = { i: number; c: Cond | null };

export type Scenario = {
    /** 1-based order in the full (unfiltered) list */
    n: number;
    /** TSS-001 (success) / TSN-001 (negative) */
    id: string;
    path: PathItem[];
    type: "happy" | "neg";
    loops: number;
    pri: number;
    /** scenarios collapsed into this one by EP */
    covers?: Scenario[];
};

export type Generated = { list: Scenario[]; capped: boolean };

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

export function generate(flow: Flow, limit = 1000): Generated {
    const steps = flow.steps;
    const out: PathItem[][] = [];
    let capped = false;
    const idx: Record<string, number> = {};
    steps.forEach((s, i) => {
        idx[s.id] = i;
    });

    function walk(
        i: number,
        path: PathItem[],
        usage: Record<string, number>,
        tags: Tags
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
        if (!s.conds.length) {
            walk(i + 1, path.concat([{ i, c: null }]), usage, tags);
            return;
        }
        for (const c of s.conds) {
            if (!needOk(c, tags)) continue;
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
                walk(t, p, { ...usage, [c.id]: u + 1 }, nt);
                continue;
            }
            walk(i + 1, p, usage, nt);
        }
    }
    walk(0, [], {}, {});

    const loopN = (p: PathItem[]) =>
        p.filter((v) => v.c && v.c.action === "loop").length;
    // no loops first, then the longest path first (happy path is case 1)
    out.sort((a, b) => loopN(a) - loopN(b) || b.length - a.length);

    let nS = 0;
    let nN = 0;
    const list: Scenario[] = out.map((path, k) => {
        const type = classify(path);
        const num = type === "happy" ? ++nS : ++nN;
        return {
            n: k + 1,
            id:
                (type === "happy" ? "TSS-" : "TSN-") +
                String(num).padStart(3, "0"),
            path,
            type,
            loops: loopN(path),
            pri: priOf(path),
        };
    });
    return { list, capped };
}

/**
 * Equivalence partitioning: a condition marked `variant` (and not used as a
 * tag by anyone) does not make a case different, so cases that differ only in
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
            sc.covers = [];
            keep.push(sc);
        } else seen[sig].covers!.push(sc);
    });
    const cov = new Set<string>();
    keep.forEach((sc) => sc.path.forEach((v) => v.c && cov.add(v.c.id)));
    const ids: string[] = [];
    list.forEach((sc) =>
        sc.path.forEach((v) => {
            if (v.c && ids.indexOf(v.c.id) < 0) ids.push(v.c.id);
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
            if (!sc.path.some((v) => v.c && v.c.id === id)) return;
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
            b.path.forEach((v) => v.c && cov.add(v.c.id));
        }
    });
    const keptIds = new Set(keep.map((s) => s.id));
    keep.forEach((sc) => {
        sc.covers = (sc.covers || []).filter((o) => !keptIds.has(o.id));
    });
    return Array.from(new Set(keep)).sort((a, b) => a.n - b.n);
}

/** Each-choice (1-wise): fewest cases that touch every condition once. */
export function minimal(list: Scenario[]): Scenario[] {
    const all = new Set<string>();
    list.forEach((sc) => sc.path.forEach((v) => v.c && all.add(v.c.id)));
    const negN = (sc: Scenario) => sc.path.filter((v) => v.c && v.c.neg).length;
    const chosen: Scenario[] = [];
    const cov = new Set<string>();
    const add = (sc: Scenario) => {
        chosen.push(sc);
        sc.path.forEach((v) => v.c && cov.add(v.c.id));
    };
    const fill = (pool: Scenario[]) => {
        while (cov.size < all.size) {
            let best: Scenario | null = null;
            let bs = 0;
            for (const sc of pool) {
                if (chosen.indexOf(sc) >= 0) continue;
                const n = new Set(
                    sc.path
                        .filter((v) => v.c && !cov.has(v.c.id))
                        .map((v) => v.c!.id)
                ).size;
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

/** Pairwise (2-wise): every pair of conditions that can co-occur is covered. */
export function pairwise(list: Scenario[]): Scenario[] {
    const items = (sc: Scenario) => {
        const ids = Array.from(
            new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))
        ).sort();
        const out: string[] = ids.slice();
        for (let a = 0; a < ids.length; a++)
            for (let b = a + 1; b < ids.length; b++)
                out.push(ids[a] + "&" + ids[b]);
        return out;
    };
    const per = list.map(items);
    const need = new Set<string>();
    per.forEach((a) => a.forEach((x) => need.add(x)));
    const cov = new Set<string>();
    const chosen: number[] = [];
    while (cov.size < need.size) {
        let best = -1;
        let bs = 0;
        per.forEach((a, k) => {
            if (chosen.indexOf(k) >= 0) return;
            const n = a.filter((x) => !cov.has(x)).length;
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
        });
        if (best < 0) break;
        chosen.push(best);
        per[best].forEach((x) => cov.add(x));
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
                R.push({
                    lv: "err",
                    msg: `${cn}: no scenario uses this condition (constraints conflict)`,
                });
        });
    });
    if (g.capped)
        R.push({
            lv: "warn",
            msg: "More than 1,000 paths: generation stopped at 1,000. Use @ep, @pair or @min, or add constraints.",
        });
    return R.sort((a, b) => (a.lv === b.lv ? 0 : a.lv === "err" ? -1 : 1));
}
