import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow, Mode } from "./core/flow";
import { modeTip, passesNegative, singles, VIA_NEGATIVE, type Generated, type Issue, type Scenario } from "./core/scenarios";
import { scenarioFlow } from "./core/scenarioFlow";
import { formatFlow } from "./core/syntax";
import { fitHeight, textBox, type Tone } from "./textBox";

const W = 300;
const GAP = 24;
const PAD = 40;
const HEAD = 70;
const FONT = 13; // a scenario note
const HEAD_FONT = 14;

export const MODE_LABEL: Record<Mode, string> = {
    ep: "Equivalence Partitioning",
    all: "All Paths",
    pair: "Pairwise (2-wise)",
    min: "Each-Choice (1-wise)",
};


/**
 * The text of a scenario note, in the flow syntax, so that selecting the note
 * and pressing "flow" draws that case. The title carries the case id; the
 * steps keep their full names and their data / expect fields.
 */
function lines(sc: Scenario, flow: Flow): string[] {
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
        st.conds = st.conds.map((c) => ({ ...c, pri: "", variant: false, tags: "", need: "" }));
    const out = formatFlow(cf, { title })
        .split("\n")
        .filter((l) => l.trim());
    if (sc.covers && sc.covers.length) out.push(`# also stands for ${sc.covers.length} similar`);
    return out;
}

const toneOf = (sc: Scenario): Tone =>
    sc.type === "neg" ? "pink" : sc.loops ? "orange" : "green";

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
    if (!missC.length && !missE.length && !missP.length)
        out.push(`OK: every choice${allE.size ? ", every loop end" : ""}${pairsPromised ? " and every pair" : ""} is covered`);
    else {
        if (missC.length) out.push(`MISSING choices: ${names(missC)}`);
        if (missE.length) out.push(`MISSING loop ends: ${names(missE)}`);
        if (missP.length) out.push(`MISSING pairs: ${missP.length}`);
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
    return [...list].sort(
        (a, b) =>
            (a.type === "happy" ? 0 : 1) - (b.type === "happy" ? 0 : 1) ||
            a.pri - b.pri ||
            a.id.localeCompare(b.id)
    );
}

export type BoardOut = { frameId: string; elements: DrawdyElementSchema[] };

export function renderScenarios(opts: {
    flow: Flow;
    mode: Mode;
    shown: Scenario[];
    gen: Generated;
    /** scenario counts per mode, shown in the header for comparison */
    counts: { all: number; ep: number; pair: number; min: number };
    issues: Issue[];
    origin: [number, number];
    generateId: () => string;
}): BoardOut {
    const { flow, mode, gen, counts, issues, origin, generateId } = opts;
    // happy scenarios first, then negative; each group by priority (P1 first), then id
    const shown = orderScenarios(opts.shown);
    // a few scenarios sit in 4 columns; a lot of scenarios spread over more columns,
    // so the frame stays about as wide as it is tall
    const COLS = shown.length <= 40 ? 4 : Math.min(12, Math.ceil(Math.sqrt(shown.length * 0.8)));
    const [ox, oy] = origin;
    const frameId = generateId();

    // header note: counts, coverage and validation
    const happy = shown.filter((s) => s.type === "happy").length;
    const head: string[] = [
        `${MODE_LABEL[mode]}`,
        `${shown.length} of ${gen.list.length} paths · ${happy} happy · ${shown.length - happy} negative`,
        `All ${counts.all} · EP ${counts.ep} · Pairwise ${counts.pair} · Each-Choice ${counts.min}`,
        ...coverageLines(shown, gen, mode),
        ...requirementLines(shown, flow),
        modeTip(flow, counts),
    ];
    if (issues.length) {
        head.push("");
        issues.slice(0, 6).forEach((i) => head.push(`${i.lv === "err" ? "ERROR" : "WARN"}: ${i.msg}`));
        if (issues.length > 6) head.push(`… ${issues.length - 6} more`);
    } else head.push("", "Flow check: no problems");
    const innerW0 = COLS * W + (COLS - 1) * GAP;
    const headH = fitHeight(head.join("\n"), innerW0, HEAD_FONT);

    const elements: DrawdyElementSchema[] = [];
    const rowsH: number[] = [];
    const hs = shown.map((sc) => fitHeight(lines(sc, flow).join("\n"), W, FONT));
    for (let i = 0; i < shown.length; i += COLS)
        rowsH.push(Math.max(...hs.slice(i, i + COLS)));

    const innerW = COLS * W + (COLS - 1) * GAP;
    const top = oy + HEAD;
    const rowsTotal = rowsH.reduce((a, b) => a + b + GAP, 0);
    const frameW = innerW + PAD * 2;
    const frameH = HEAD + headH + GAP + rowsTotal + PAD;

    elements.push({
        type: "frame",
        drawdyElementId: frameId,
        name: `Scenarios · ${MODE_LABEL[mode]} · ${shown.length} scenarios`,
        position: [ox, oy],
        width: frameW,
        height: frameH,
        rotation: 0,
        meta: { e2eScenarios: true, mode, count: shown.length, flow },
    });

    elements.push(
        textBox({
            id: generateId(),
            frameId,
            x: ox + PAD,
            y: top,
            width: innerW,
            height: headH,
            text: head.join("\n"),
            fontSize: HEAD_FONT,
            tone: issues.some((i) => i.lv === "err") ? "pink" : "blue",
        })
    );

    let y = top + headH + GAP;
    shown.forEach((sc, k) => {
        const col = k % COLS;
        const row = Math.floor(k / COLS);
        if (col === 0 && row > 0) y += rowsH[row - 1] + GAP;
        elements.push(
            textBox({
                id: generateId(),
                frameId,
                x: ox + PAD + col * (W + GAP),
                y,
                width: W,
                height: rowsH[row],
                text: lines(sc, flow).join("\n"),
                fontSize: FONT,
                tone: toneOf(sc),
                meta: {
                    kind: "scenario",
                    id: sc.id,
                    type: sc.type,
                    // [step index, condition id | null] for each stop on the path
                    path: sc.path.map((v) => [v.i, v.c ? v.c.id : null]),
                },
            })
        );
    });

    return { frameId, elements };
}
