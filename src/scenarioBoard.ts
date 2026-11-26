import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow, Mode } from "./core/flow";
import type { Generated, Issue, Scenario } from "./core/scenarios";
import { MODE_LABEL, noteLines, orderScenarios, reportHeader } from "./core/scenarioText";
import { fitHeight, textBox, type Tone } from "./textBox";

const W = 300;
const GAP = 24;
const PAD = 40;
const HEAD = 70;
const FONT = 13; // a scenario note
const HEAD_FONT = 14;


const toneOf = (sc: Scenario): Tone =>
    sc.type === "neg" ? "pink" : sc.loops ? "orange" : "green";

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
    const head = reportHeader({ flow, mode, shown, gen, counts, issues });
    const innerW0 = COLS * W + (COLS - 1) * GAP;
    const headH = fitHeight(head.join("\n"), innerW0, HEAD_FONT);

    const elements: DrawdyElementSchema[] = [];
    const rowsH: number[] = [];
    const hs = shown.map((sc) => fitHeight(noteLines(sc, flow).join("\n"), W, FONT));
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
                text: noteLines(sc, flow).join("\n"),
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
