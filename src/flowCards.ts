// Flow per scenario: the whole flow once, and below it two columns of cards: Happy on the
// left, Negative on the right, each card stacked under its column head (OUT-68). Under each
// place on the flow where scenarios end, a label gives the IDs of the scenarios that end
// there (OUT-69); no lines are drawn. Everything is worked out first; then every element is
// added hidden and shown in one update, so the drawing appears together (DRV-77).

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow } from "./core/flow";
import { renderFlow } from "./render";
import { generateId, run } from "./host";
import { frameSize } from "./selection";
import { addInBatches } from "./drawing";
import { moved, placeFor, put } from "./placement";
import type { ScenarioItem } from "./core/testSteps";

const GAP = 80; // between cards in a column, and between the blocks
const COL_GAP = 240; // between the Happy and the Negative column
const HEAD_H = 56; // a column head
const HAPPY_LINE = "#2f9e44";
const NEG_LINE = "#c92a2a";
const HAPPY_BG = "#ebfbee";
const NEG_BG = "#fff5f5";

/** The flow the scenarios come from, and where each scenario's path goes through it. */
export type FlowSource = { flow: Flow; paths: [number, string | null][][] };

type Label = { arrowId: string; text: string; mid: [number, number]; color: string };

const kindOf = (title: string) => (title.split(" · ")[1] === "Negative" ? "negative" : "happy");
const idOf = (title: string) => title.split(" · ")[0];

/** The element of the flow where a scenario's path ends: its last choice, or its last step. */
function endElementOf(source: FlowSource, path: [number, string | null][], flowEls: any[]): any | undefined {
    const last = [...path].reverse().find(([, cid]) => cid !== null);
    if (last) {
        const [i, cid] = last;
        const cond = source.flow.steps[i].conds.find((c) => c.id === cid);
        if (cond?.action === "end") return flowEls.find((e) => e.meta?.kind === "end" && e.meta?.condId === cid);
        return flowEls.find((e) => e.meta?.kind === "step" && e.meta?.stepId === source.flow.steps[i].id);
    }
    const i = path.length ? path[path.length - 1][0] : source.flow.steps.length - 1;
    return flowEls.find((e) => e.meta?.kind === "step" && e.meta?.stepId === source.flow.steps[i].id);
}

/** Draws the flow above and the two columns of cards below it. Returns "" or an error text. */
export async function drawFlowCards(
    scenarios: ScenarioItem[],
    anchor: { x: number; y: number; height: number },
    source?: FlowSource
): Promise<string> {
    // 1. measure: every card, and the flow at the origin (to order the columns by where they end)
    const sizes = scenarios.map((sc) => frameSize(renderFlow(sc.flow, generateId, [0, 0], { success: kindOf(sc.title) !== "negative", name: sc.title }).elements));
    const flowMeasure = source ? renderFlow(source.flow, generateId, [0, 0], { success: true }) : null;
    const flowSize = flowMeasure ? frameSize(flowMeasure.elements) : { w: 0, h: 0 };
    const endX = (k: number): number => {
        if (!source || !flowMeasure) return Number.MAX_SAFE_INTEGER;
        const e = endElementOf(source, source.paths[k], flowMeasure.elements as any[]);
        return e ? e.x + e.width / 2 : Number.MAX_SAFE_INTEGER;
    };
    const byEnd = (a: number, b: number) => endX(a) - endX(b) || a - b;
    const happy = scenarios.flatMap((sc, k) => (kindOf(sc.title) === "happy" ? [k] : [])).sort(byEnd);
    const neg = scenarios.flatMap((sc, k) => (kindOf(sc.title) === "negative" ? [k] : [])).sort(byEnd);

    // 2. the block: the flow on top, the heads and the two columns below it
    const colW = Math.max(0, ...sizes.map((s) => s.w));
    const colH = (items: number[]) => items.reduce((a, k) => a + sizes[k].h + GAP, 0);
    const headY = source ? flowSize.h + GAP : 0;
    const cardsY = headY + HEAD_H + GAP;
    const negX = colW + COL_GAP;
    const width = Math.max(flowSize.w, negX + colW);
    const height = cardsY + Math.max(colH(happy), colH(neg), 0);
    const [bx, by] = await placeFor(anchor.x, anchor.y + anchor.height + 120, width, height);

    // 3. render at their places
    const flowOut = source ? renderFlow(source.flow, generateId, [bx, by], { success: true }) : null;
    const headIds = { happy: generateId(), negative: generateId() };
    const headEls: DrawdyElementSchema[] = [];
    const cardOut: { frameId: string; elements: DrawdyElementSchema[]; labels: Label[] }[] = [];
    const cardAt: [number, number][] = [];
    const place = (items: number[], x: number, kind: "happy" | "negative") => {
        let y = cardsY;
        const count = items.length;
        headEls.push({
            type: "shape",
            componentType: "rect",
            drawdyElementId: headIds[kind],
            x: bx + x,
            y: by + headY,
            width: colW,
            height: HEAD_H,
            strokeColor: kind === "happy" ? HAPPY_LINE : NEG_LINE,
            fillColor: kind === "happy" ? HAPPY_BG : NEG_BG,
            roughness: 0,
            text: `${kind === "happy" ? "Happy" : "Negative"} (${count})`,
            fontSize: 16,
            bold: true,
            textAlign: "center",
            textVerticalAlign: "middle",
        } as DrawdyElementSchema);
        for (const k of items) {
            cardAt[k] = [bx + x, by + y];
            cardOut[k] = renderFlow(scenarios[k].flow, generateId, cardAt[k], { success: kind !== "negative", name: scenarios[k].title });
            y += sizes[k].h + GAP;
        }
    };
    place(happy, 0, "happy");
    place(neg, negX, "negative");

    // 4. one line per place where scenarios end, and kind: from the place to the column head
    const elements: DrawdyElementSchema[] = [
        ...(flowOut?.elements ?? []),
        ...headEls,
        ...cardOut.flatMap((c) => c?.elements ?? []),
    ];
    const labels: Label[] = [
        ...(flowOut?.labels ?? []),
        ...cardOut.flatMap((c) => c?.labels ?? []),
    ];
    if (source && flowOut) {
        const flowEls = flowOut.elements as any[];
        const groups = new Map<string, { kind: "happy" | "negative"; from: any; ids: string[] }>();
        scenarios.forEach((sc, k) => {
            const from = endElementOf(source, source.paths[k], flowEls);
            if (!from) return;
            const kind = kindOf(sc.title);
            const key = kind + "|" + from.drawdyElementId;
            const g = groups.get(key) ?? { kind, from, ids: [] };
            g.ids.push(idOf(sc.title));
            groups.set(key, g);
        });
        // a label under each place where scenarios end; two kinds ending at one place stack
        const stacked = new Map<string, number>();
        for (const g of groups.values()) {
            const color = g.kind === "happy" ? HAPPY_LINE : NEG_LINE;
            const shown = g.ids.length <= 3 ? g.ids.join(", ") : `${g.ids.slice(0, 3).join(", ")} +${g.ids.length - 3}`;
            const cx = g.from.x + g.from.width / 2;
            const row = stacked.get(g.from.drawdyElementId) ?? 0;
            stacked.set(g.from.drawdyElementId, row + 1);
            elements.push({
                type: "text",
                drawdyElementId: generateId(),
                x: cx - shown.length * 4.5,
                y: g.from.y + g.from.height + 12 + row * 22,
                text: shown,
                fontSize: 14,
                color,
                textAlign: "center",
            } as DrawdyElementSchema);
        }
    }

    // 5. add everything hidden, then show it all in one update
    const failed = await put((dx, dy) => revealTogether(moved(elements, dx, dy), labels));
    return failed ?? "";
}

/** Adds the elements with opacity 0, then sets every one to visible (and labels the lines) in one call. */
async function revealTogether(elements: DrawdyElementSchema[], labels: { arrowId: string; text: string }[]): Promise<string> {
    const hidden = elements.map((e: any) => ({ ...e, opacity: 0 }));
    const err = await addInBatches(hidden);
    if (err) return err;
    const props = new Map<string, Record<string, unknown>>();
    for (const e of elements as any[]) if (e.drawdyElementId) props.set(e.drawdyElementId, { opacity: 1 });
    for (const l of labels) props.set(l.arrowId, { ...(props.get(l.arrowId) ?? {}), opacity: 1, text: l.text });
    const upd = await run("command:scene:update-drawdy-elements", {
        updates: [...props].map(([drawdyElementId, properties]) => ({ drawdyElementId, properties })),
    });
    return upd.error ?? "";
}
