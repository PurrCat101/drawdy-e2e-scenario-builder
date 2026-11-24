import { run } from "./host";

/** Reading the board: what is selected, what is where, and where there is free room. */

export type Box = { x: number; y: number; width: number; height: number };

export type Picked = {
    id: string;
    type: string;
    text: string;
    meta: Record<string, any>;
    frameId: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

/** Read elements by id: text, meta, frame and geometry. */
export async function readElements(ids: string[]): Promise<Picked[]> {
    if (!ids.length) return [];
    const got = await run("command:scene:get-drawdy-elements", {
        drawdyElementIds: ids,
        properties: ["type", "text", "meta", "frameId", "x", "y", "width", "height"],
    });
    const els: any[] = got.value?.drawdyElements ?? [];
    return els.map((e) => ({
        id: e.id ?? "",
        type: e.type ?? "",
        text: typeof e.text === "string" ? e.text : "",
        meta: e.meta ?? {},
        frameId: e.frameId ?? "",
        x: e.x ?? 0,
        y: e.y ?? 0,
        width: e.width ?? 0,
        height: e.height ?? 0,
    }));
}
export async function currentSelectionIds(): Promise<string[]> {
    const cur = await run("command:scene:get-current-selected-drawdy-elements", undefined);
    return cur.value?.drawdyElementIds ?? [];
}

/** Where a drawing from typed text goes: under the selected element, else in view. */
export async function anchorFor(sel: Picked[]): Promise<Box> {
    if (sel.length) return sel[0];
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    return { x: r.x + 60, y: r.y + 60, width: 0, height: 0 };
}

/* ----------------------------- free-space search ---------------------------- */

/** Boxes of everything already on the board (elements that have a size). */
export async function occupiedRects(): Promise<Box[]> {
    const got = await run("command:scene:get-drawdy-elements", {
        properties: ["x", "y", "width", "height"],
    });
    const els: any[] = got.value?.drawdyElements ?? [];
    return els
        .filter(
            (e) =>
                typeof e.x === "number" &&
                typeof e.y === "number" &&
                e.width > 0 &&
                e.height > 0
        )
        .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
}

const hits = (a: Box, b: Box) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;

/**
 * Find a free spot for a w x h block, starting at (x, y). While the block would
 * overlap something (with `gap` of breathing room) it moves down to just below
 * that thing, so new results stack under what is already there.
 */
export function findFree(
    occupied: Box[],
    x: number,
    y: number,
    w: number,
    h: number,
    gap = 100
): [number, number] {
    let cy = y;
    for (let i = 0; i < 200; i++) {
        const probe = { x: x - gap, y: cy - gap, width: w + gap * 2, height: h + gap * 2 };
        const hit = occupied.filter((o) => hits(probe, o));
        if (!hit.length) return [x, cy];
        cy = Math.max(...hit.map((o) => o.y + o.height)) + gap;
    }
    return [x, cy];
}

/** Size of the frame (first element) a render would produce. */
export const frameSize = (els: any[]): { w: number; h: number } => ({
    w: els[0].width,
    h: els[0].height,
});

/** How many scenarios a table holds: tables drawn by earlier versions stored it as `scenarios`. */
export const tableCount = (meta: Record<string, any>): number => Number(meta.scenarios ?? meta.cases ?? 1);
