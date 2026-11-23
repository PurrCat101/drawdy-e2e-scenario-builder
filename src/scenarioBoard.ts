import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow, Mode } from "./flow";
import type { Generated, Issue, Scenario } from "./scenarios";
import { caseFlow } from "./caseFlow";
import { formatFlow } from "./syntax";

const W = 300;
const GAP = 24;
const PAD = 40;
const HEAD = 70;
const CPL = 34; // approx characters per line in a note at fontSize 13

const MODE_LABEL: Record<Mode, string> = {
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
        (sc.loops ? ` · loop x${sc.loops}` : "");
    const cf = caseFlow(
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

const wrapped = (ls: string[]) =>
    ls.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / CPL)), 0);

const fillOf = (sc: Scenario) =>
    sc.type === "neg" ? "pink" : sc.loops ? "orange" : "lime";

/** How much of the flow the shown cases touch: conditions and pairs of conditions. */
function coverageLine(shown: Scenario[], gen: Generated): string {
    const conds = (sc: Scenario) => [...new Set(sc.path.filter((v) => v.c).map((v) => v.c!.id))].sort();
    const pairs = (sc: Scenario) => {
        const ids = conds(sc);
        const out: string[] = [];
        for (let a = 0; a < ids.length; a++)
            for (let b = a + 1; b < ids.length; b++) out.push(ids[a] + "&" + ids[b]);
        return out;
    };
    const allC = new Set<string>();
    const allP = new Set<string>();
    gen.list.forEach((sc) => {
        conds(sc).forEach((x) => allC.add(x));
        pairs(sc).forEach((x) => allP.add(x));
    });
    const gotC = new Set<string>();
    const gotP = new Set<string>();
    shown.forEach((sc) => {
        conds(sc).forEach((x) => gotC.add(x));
        pairs(sc).forEach((x) => gotP.add(x));
    });
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
    return (
        `Coverage of ${shown.length} cases: ` +
        `condition ${gotC.size}/${allC.size} (${pct(gotC.size, allC.size)}%) · ` +
        `pair ${gotP.size}/${allP.size} (${pct(gotP.size, allP.size)}%)`
    );
}

/** Happy cases first, then negative; each group by priority (P1 first), then id. */
export function orderCases(list: Scenario[]): Scenario[] {
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
    // happy cases first, then negative; each group by priority (P1 first), then id
    const shown = orderCases(opts.shown);
    // a few cases sit in 4 columns; a lot of cases spread over more columns,
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
        coverageLine(shown, gen),
        ...(!flow.steps.some((st) => st.conds.some((c) => c.variant)) && counts.ep > 30
            ? ["", "EP is close to All because no condition has [variant] (EP only groups conditions marked variant). Add [variant], or pick the Pair / Each mode."]
            : []),
    ];
    if (issues.length) {
        head.push("");
        issues.slice(0, 6).forEach((i) => head.push(`${i.lv === "err" ? "ERROR" : "WARN"}: ${i.msg}`));
        if (issues.length > 6) head.push(`… ${issues.length - 6} more`);
    } else head.push("", "Flow check: no problems");
    const headH = Math.max(140, 50 + wrapped(head) * 19);

    const elements: DrawdyElementSchema[] = [];
    const rowsH: number[] = [];
    const hs = shown.map((sc) => Math.max(150, 40 + wrapped(lines(sc, flow)) * 19));
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
        name: `Scenarios · ${MODE_LABEL[mode]} · ${shown.length} cases`,
        position: [ox, oy],
        width: frameW,
        height: frameH,
        rotation: 0,
        meta: { e2eScenarios: true, mode, count: shown.length, flow },
    });

    elements.push({
        type: "shape",
        componentType: "sticky-note",
        drawdyElementId: generateId(),
        frameId,
        x: ox + PAD,
        y: top,
        width: innerW,
        height: headH,
        text: head.join("\n"),
        fontSize: 14,
        fillColor: issues.some((i) => i.lv === "err") ? "pink" : "blue",
    });

    let y = top + headH + GAP;
    shown.forEach((sc, k) => {
        const col = k % COLS;
        const row = Math.floor(k / COLS);
        if (col === 0 && row > 0) y += rowsH[row - 1] + GAP;
        elements.push({
            type: "shape",
            componentType: "sticky-note",
            drawdyElementId: generateId(),
            frameId,
            x: ox + PAD + col * (W + GAP),
            y,
            width: W,
            height: rowsH[row],
            text: lines(sc, flow).join("\n"),
            fontSize: 13,
            fillColor: fillOf(sc),
            meta: {
                kind: "scenario",
                id: sc.id,
                type: sc.type,
                // [step index, condition id | null] for each stop on the path
                path: sc.path.map((v) => [v.i, v.c ? v.c.id : null]),
            },
        });
    });

    return { frameId, elements };
}
