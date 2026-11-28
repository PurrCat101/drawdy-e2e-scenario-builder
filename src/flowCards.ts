// Flow per scenario: one card per scenario of the chosen mode. A card is that scenario's
// own flow, its end green when it passes and red when it fails (OUT-68). Everything is
// worked out first; then every card is added hidden and shown in one update, so the
// cards appear together and not piece by piece (DRV-77).

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { renderFlow } from "./render";
import { generateId, run } from "./host";
import { frameSize } from "./selection";
import { addInBatches } from "./drawing";
import { moved, placeFor, put } from "./placement";
import type { ScenarioItem } from "./core/testSteps";

const GAP = 120; // between cards, and between rows
const ROW_W = 4000; // a row of cards is at most this wide (board units)

const kindOf = (title: string) => (title.split(" · ")[1] === "Negative" ? "negative" : "happy");

/** Draws one card per scenario below `anchor`. Returns "" or an error text. */
export async function drawFlowCards(scenarios: ScenarioItem[], anchor: { x: number; y: number; height: number }): Promise<string> {
    // 1. measure every card at the origin, to lay the cards out
    const sizes = scenarios.map((sc) => {
        const out = renderFlow(sc.flow, generateId, [0, 0], { name: sc.title, success: kindOf(sc.title) !== "negative" });
        return frameSize(out.elements);
    });
    const pos: [number, number][] = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    let width = 0;
    sizes.forEach((s) => {
        if (x > 0 && x + s.w > ROW_W) {
            x = 0;
            y += rowH + GAP;
            rowH = 0;
        }
        pos.push([x, y]);
        x += s.w + GAP;
        rowH = Math.max(rowH, s.h);
        width = Math.max(width, x - GAP);
    });
    const height = y + rowH;
    // 2. find room for the whole block, then render every card at its place
    const [bx, by] = await placeFor(anchor.x, anchor.y + anchor.height + 120, width, height);
    const outs = scenarios.map((sc, k) =>
        renderFlow(sc.flow, generateId, [bx + pos[k][0], by + pos[k][1]], {
            name: sc.title,
            success: kindOf(sc.title) !== "negative",
        })
    );
    const elements = outs.flatMap((o) => o.elements);
    const labels = outs.flatMap((o) => o.labels);
    // 3. add everything hidden, then show it all in one update
    const failed = await put((dx, dy) => revealTogether(moved(elements, dx, dy), labels));
    return failed ?? "";
}

/** Adds the elements with opacity 0, then sets every one to visible (and labels the arrows) in one call. */
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
