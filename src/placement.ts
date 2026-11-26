import { generateId, run } from "./host";
import { findFree, occupiedRects, type Box } from "./selection";
import { toPanel } from "./webview";

/**
 * Where new drawings go (DRV-70 to DRV-76).
 *
 * "auto": each drawing goes into free space and the camera flies to it (OUT-01, OUT-02).
 * "hand": a button's drawings are kept back as one block, an outline of it follows the
 * pointer, and a click on the board draws it there. The camera does not move.
 */

/** Add elements moved by (dx, dy). Returns an error text, or "". */
export type Job = (dx: number, dy: number) => Promise<string>;

type Block = { boxes: Box[]; jobs: Job[] };
type Held = Block & { bounds: Box; done: string; ghostId: string; previewId: string; subs: string[] };

/** Space between the drawings stacked into one block. */
const STACK_GAP = 100;
/** A pointer that moved further than this (screen pixels) was dragging, not clicking. */
const CLICK_SLOP = 5;

let capture: Block | null = null;
let held: Held | null = null;
let pressed: { x: number; y: number } | null = null;
let ghostAt: { x: number; y: number } | null = null;
let moving = false;

/** A fresh start (the driver was activated). */
export function resetPlacement() {
    capture = held = null;
    pressed = ghostAt = null;
    moving = false;
}

export const isHolding = () => held !== null;

/** From now on drawings are kept back, until `endCapture`. */
export function startCapture() {
    capture = { boxes: [], jobs: [] };
}

export function abortCapture() {
    capture = null;
}

/**
 * The origin of a w x h drawing wanted at (x, y). Automatic: moved down past what is on
 * the board. Held back: the first stays where wanted, the next ones go under it, so
 * the whole block is compact whatever is on the board.
 */
export async function placeFor(x: number, y: number, w: number, h: number): Promise<[number, number]> {
    if (!capture) return findFree(await occupiedRects(), x, y, w, h);
    const first = capture.boxes[0];
    const at: [number, number] = first
        ? [first.x, Math.max(...capture.boxes.map((b) => b.y + b.height)) + STACK_GAP]
        : [x, y];
    capture.boxes.push({ x: at[0], y: at[1], width: w, height: h });
    return at;
}

/** Draw now, or keep the drawing for the click that places the block. */
export async function put(job: Job): Promise<string> {
    if (!capture) return job(0, 0);
    capture.jobs.push(job);
    return "";
}

/** Fly the camera to what was drawn; never while the block is held back. */
export async function flyTo(drawdyElementIds: string[], zoom: number) {
    if (capture) return;
    await run("command:camera:fly-to-elements", { drawdyElementIds, flyDurationMs: 400, zoom });
}

/** The same elements, moved. Arrows bound to elements follow them by themselves. */
export function moved<T>(elements: T[], dx: number, dy: number): T[] {
    if (!dx && !dy) return elements;
    const point = (p: [number, number]): [number, number] => [p[0] + dx, p[1] + dy];
    return elements.map((e: any) => ({
        ...e,
        ...(typeof e.x === "number" ? { x: e.x + dx, y: e.y + dy } : {}),
        ...(e.position ? { position: point(e.position) } : {}),
        ...(e.from ? { from: point(e.from) } : {}),
        ...(e.to ? { to: point(e.to) } : {}),
        ...(e.bend ? { bend: e.bend.map(point) } : {}),
    }));
}

const boundsOf = (boxes: Box[]): Box => {
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    return {
        x,
        y,
        width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
        height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
    };
};

/** The outline that follows the pointer: a preview element, never saved on the board. */
const ghost = (id: string, x: number, y: number, size: Box) => ({
    type: "shape",
    componentType: "rect",
    drawdyElementId: id,
    x,
    y,
    width: size.width,
    height: size.height,
    strokeColor: "#4d7c0f",
    fillColor: "#ecfccb",
    strokeWidth: 3,
    strokeDash: "dashed",
    opacity: 0.6,
    roughness: 0,
    text: "Click to place · Esc to cancel",
    fontSize: Math.round(Math.min(64, Math.max(14, size.width / 24))),
});

/**
 * The button has made its drawings: hold them, and return the status to show. With
 * nothing to place (an error, or only a hint note) `done` is returned as it is.
 */
export async function endCapture(done: string): Promise<string> {
    const block = capture;
    capture = null;
    if (!block?.jobs.length) return done;
    const bounds = boundsOf(block.boxes);
    // until the pointer moves, the outline sits in the view
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    const ghostId = generateId();
    const made = await run("command:scene:create-drawdy-preview-elements", {
        elements: [ghost(ghostId, r.x + 60, r.y + 60, bounds)],
        hitTestable: false,
    });
    const h: Held = { ...block, bounds, done, ghostId, previewId: made.value?.previewId ?? "", subs: [] };
    if (made.error) {
        // no outline to move: draw it the automatic way instead
        held = h;
        return placeAutomatically();
    }
    held = h;
    for (const [type, req] of [
        ["subscription:scene:pointer-position", undefined],
        ["subscription:scene:click", {}],
        ["subscription:scene:pointer", {}],
        ["subscription:keyboard:control-keys", undefined],
    ] as const) {
        const s = await run(type, req);
        if (s.value?.subscriptionId) h.subs.push(s.value.subscriptionId);
    }
    await toPanel({ type: "placing", on: true });
    return "Move to where it should go and click the board (Esc cancels)";
}

/** Stop holding: remove the outline and stop listening. Returns what was held. */
async function release(): Promise<Held | null> {
    const h = held;
    held = null;
    pressed = ghostAt = null;
    if (!h) return null;
    if (h.previewId) await run("command:scene:delete-drawdy-preview-elements", { previewIds: [h.previewId] });
    for (const subscriptionId of h.subs) await run("command:subscription:remove", { subscriptionId });
    await toPanel({ type: "placing", on: false });
    return h;
}

async function draw(h: Held, dx: number, dy: number): Promise<string> {
    for (const job of h.jobs) {
        const failed = await job(dx, dy);
        if (failed) return "Could not draw: " + failed;
    }
    return h.done;
}

/** Draw the held block with its top left corner at (x, y). Returns the status, or "". */
export async function placeAt(x: number, y: number): Promise<string> {
    const h = await release();
    return h ? draw(h, x - h.bounds.x, y - h.bounds.y) : "";
}

/** Draw the held block in free space near where it was made (the panel's button). */
export async function placeAutomatically(): Promise<string> {
    const h = await release();
    if (!h) return "";
    const b = h.bounds;
    const [x, y] = findFree(await occupiedRects(), b.x, b.y, b.width, b.height);
    return draw(h, x - b.x, y - b.y);
}

export async function cancelPlacement(): Promise<string> {
    return (await release()) ? "Cancelled: nothing was drawn" : "";
}

/** Move the outline to the latest pointer position, one command at a time. */
async function follow(p: { x: number; y: number }) {
    ghostAt = p;
    if (moving) return;
    moving = true;
    try {
        while (held && ghostAt) {
            const at = ghostAt;
            ghostAt = null;
            await run("command:scene:update-drawdy-preview-elements", {
                elements: [ghost(held.ghostId, at.x, at.y, held.bounds)],
            });
        }
    } finally {
        moving = false;
    }
}

const status = async (text: string) => {
    if (text) await toPanel({ type: "status", text, bad: /^Could not/.test(text) });
};

/** Board events while a block is held. Returns true when the event was one of them. */
export async function onPlacementEvent(event: any): Promise<boolean> {
    const type: string = event?.type ?? "";
    if (type === "subscription:scene:pointer-position") {
        if (held) await follow(event.body.position.canvasSpace);
        return true;
    }
    if (type === "subscription:scene:click") {
        if (held) {
            const p = event.body.cursor.canvasSpace;
            await status(await placeAt(p.x, p.y));
        }
        return true;
    }
    // a click on empty board may arrive only as pointer down and up
    if (type === "subscription:scene:pointer") {
        const b = event.body;
        if (!held) return true;
        if (b.type === "down") pressed = b.cursor.domSpace;
        else if (b.type === "up" && pressed) {
            const d = b.cursor.domSpace;
            const still = Math.hypot(d.x - pressed.x, d.y - pressed.y) <= CLICK_SLOP;
            pressed = null;
            if (still) await status(await placeAt(b.cursor.canvasSpace.x, b.cursor.canvasSpace.y));
        } else if (b.type === "cancel") pressed = null;
        return true;
    }
    if (type === "subscription:keyboard:control-keys") {
        if (held && event.body.key === "escape") await status(await cancelPlacement());
        return true;
    }
    return false;
}
