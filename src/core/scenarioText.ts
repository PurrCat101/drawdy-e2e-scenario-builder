// The words of a scenario report, with no drawing: the text of a scenario note, the
// header lines (counts, coverage, requirements, flow check), coverage, traceability
// and the order scenarios are shown in. Shared by the Drawdy extension and any other front end.

import type { Flow, Mode } from "./flow";
import { passesNegative, singles, basePathTest, VIA_NEGATIVE, type Generated, type Issue, type Scenario } from "./scenarios";
import { scenarioFlow } from "./scenarioFlow";
import { formatFlow } from "./syntax";

export const MODE_LABEL: Record<Mode, string> = {
    all: "All Paths",
    pair: "Pairwise (2-wise)",
    min: "Each-Choice (1-wise)",
};


/**
 * The text of a scenario note, in the flow syntax, so that selecting the note
 * and pressing "flow" draws that case. The title carries the case id; the
 * steps keep their full names and their data / expect fields.
 */
export function noteLines(sc: Scenario, flow: Flow): string[] {
    const title =
        `${sc.id} · ${sc.type === "happy" ? "Happy" : "Negative"} · P${sc.pri}` +
        (sc.type === "happy" && passesNegative(sc.path) ? ` · ${VIA_NEGATIVE}` : "") +
        (sc.loops ? ` · loop x${sc.loops}` : "");
    const cf = scenarioFlow(
        flow,
        sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null])
    );
    // only what describes the walk: no priority, tags or rules
    for (const st of cf.steps)
        st.conds = st.conds.map((c) => ({ ...c, pri: "", tags: "", need: "" }));
    const out = formatFlow(cf, { title })
        .split("\n")
        .filter((l) => l.trim());
    return out;
}


/**
 * How much of the flow the shown scenarios touch: choices, loops at their full max
 * and pairs of choices, against what All has. Says plainly whether the mode's own
 * promise is kept, and names any choice or loop end left out.
 */
const coverageMemo = new WeakMap<Scenario[], Map<string, string[]>>();

export function coverageLines(shown: Scenario[], gen: Generated, mode: Mode): string[] {
    // the same selection is measured more than once (the panel, then the frame,
    // which is rendered twice): remember the answer per selection and mode
    let memo = coverageMemo.get(shown);
    if (!memo) coverageMemo.set(shown, (memo = new Map()));
    const hit = memo.get(mode);
    if (hit) return hit;
    const lines = measureCoverage(shown, gen, mode);
    memo.set(mode, lines);
    return lines;
}

function measureCoverage(shown: Scenario[], gen: Generated, mode: Mode): string[] {
    const label = new Map<string, string>();
    gen.list.forEach((sc) => sc.path.forEach((v) => v.c && label.set(v.c.id, v.c.label)));
    const conds = (sc: Scenario) => [...new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))].sort();
    const ends = (sc: Scenario) => singles(sc).filter((x) => x.startsWith("end:"));
    const pairs = (sc: Scenario) => {
        const ids = conds(sc);
        const out: string[] = [];
        for (let a = 0; a < ids.length; a++)
            for (let b = a + 1; b < ids.length; b++) out.push(ids[a] + "&" + ids[b]);
        return out;
    };
    const of = (list: Scenario[], f: (sc: Scenario) => string[]) => new Set(list.flatMap(f));
    const [allC, allE, allP] = [of(gen.list, conds), of(gen.list, ends), of(gen.list, pairs)];
    const [gotC, gotE, gotP] = [of(shown, conds), of(shown, ends), of(shown, pairs)];
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
    const part = (name: string, got: Set<string>, all: Set<string>) =>
        `${name} ${got.size}/${all.size} (${pct(got.size, all.size)}%)`;
    const missC = [...allC].filter((x) => !gotC.has(x));
    const missE = [...allE].filter((x) => !gotE.has(x));
    const pairsPromised = mode === "pair" || mode === "all";
    const missP = pairsPromised ? [...allP].filter((x) => !gotP.has(x)) : [];
    const out = [
        `Coverage of ${shown.length} scenarios: ` +
            [part("choice", gotC, allC), ...(allE.size ? [part("loop end", gotE, allE)] : []), part("pair", gotP, allP)].join(" · "),
    ];
    const names = (ids: string[]) =>
        ids.slice(0, 6).map((x) => `"${label.get(x.replace(/^end:/, "")) ?? x}"`).join(", ") + (ids.length > 6 ? ` and ${ids.length - 6} more` : "");
    // Pairwise and Each also promise a base path (CALC-28)
    const isBase = basePathTest(gen.list);
    const missB = gen.list.some(isBase) && !shown.some(isBase);
    if (!missC.length && !missE.length && !missP.length && !missB)
        out.push(`OK: every choice${allE.size ? ", every loop end" : ""}${pairsPromised ? " and every pair" : ""} is covered`);
    else {
        if (missC.length) out.push(`MISSING choices: ${names(missC)}`);
        if (missE.length) out.push(`MISSING loop ends: ${names(missE)}`);
        if (missP.length) out.push(`MISSING pairs: ${missP.length}`);
        if (missB) out.push("MISSING base path: no Happy scenario with the fewest loops");
    }
    if (gen.unreachable && gen.unreachable.length)
        out.push(`Never reachable (see the flow check): ${names(gen.unreachable)}`);
    return out;
}

/**
 * Traceability: for every `req:` in the flow (on a step or a choice), the shown
 * scenarios that pass it. A step's req counts for every scenario through that step,
 * a choice's req for every scenario that takes the choice.
 */
export function requirementLines(shown: Scenario[], flow: Flow): string[] {
    const split = (r?: string) =>
        String(r || "")
            .split(/[,;]/)
            .map((x) => x.trim())
            .filter(Boolean);
    const order: string[] = [];
    const note = (r: string) => order.includes(r) || order.push(r);
    flow.steps.forEach((st) => {
        split(st.req).forEach(note);
        st.conds.forEach((c) => split(c.req).forEach(note));
    });
    if (!order.length) return [];
    const by = new Map<string, string[]>(order.map((r) => [r, []]));
    for (const sc of orderScenarios(shown)) {
        const reqs = new Set<string>();
        sc.path.forEach((v) => {
            split(flow.steps[v.i]?.req).forEach((r) => reqs.add(r));
            if (v.c) split(v.c.req).forEach((r) => reqs.add(r));
        });
        reqs.forEach((r) => by.get(r)?.push(sc.id));
    }
    const missing = order.filter((r) => !by.get(r)!.length);
    const out = [`Requirements: ${order.length - missing.length}/${order.length} covered`];
    const LIST = 12;
    order.slice(0, LIST).forEach((r) => {
        const ids = by.get(r)!;
        if (ids.length)
            out.push(`  ${r} → ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ` … (${ids.length})` : ""}`);
    });
    if (order.length > LIST) out.push(`  … and ${order.length - LIST} more`);
    if (missing.length) out.push(`MISSING requirements: ${missing.join(", ")}`);
    return out;
}


/** Happy scenarios first, then negative; each group by priority (P1 first), then id. */
export function orderScenarios(list: Scenario[]): Scenario[] {
    // the number of the ID, not its text: past 999 the text of TSS-1000 sorts before TSS-101
    const num = (id: string) => Number(id.slice(4));
    return [...list].sort(
        (a, b) =>
            (a.type === "happy" ? 0 : 1) - (b.type === "happy" ? 0 : 1) ||
            a.pri - b.pri ||
            num(a.id) - num(b.id) ||
            a.id.localeCompare(b.id)
    );
}

/** The header of a scenario report: what was picked, counts of every mode, coverage, requirements, flow check. */
export function reportHeader(opts: {
    flow: Flow;
    mode: Mode;
    shown: Scenario[];
    gen: Generated;
    counts: { all: number; pair: number; min: number };
    issues: Issue[];
}): string[] {
    const { flow, mode, shown, gen, counts, issues } = opts;
    const happy = shown.filter((s) => s.type === "happy").length;
    const head: string[] = [
        `${MODE_LABEL[mode]}`,
        `${shown.length} of ${gen.list.length} ${gen.capped ? "listed paths (the flow has more)" : "paths"} · ${happy} happy · ${shown.length - happy} negative`,
        `All ${counts.all}${gen.capped ? "+" : ""} · Pairwise ${counts.pair} · Each-Choice ${counts.min}`,
        ...coverageLines(shown, gen, mode),
        ...requirementLines(shown, flow),
    ];
    if (issues.length) {
        head.push("");
        issues.slice(0, 6).forEach((i) => head.push(`${i.lv === "err" ? "ERROR" : "WARN"}: ${i.msg}`));
        if (issues.length > 6) head.push(`… ${issues.length - 6} more`);
    } else head.push("", "Flow check: no problems");
    return head;
}
