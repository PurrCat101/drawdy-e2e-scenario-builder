import type { DriverCommandIssuer, DriverModule } from "@drawdy/driver-protocol";

/**
 * What every part of the driver shares: the command channel to Drawdy, the id
 * generator, the busy flag, and `note` (a status sticky on the board).
 */

let issue: DriverCommandIssuer;
let makeId: () => string;
let driverId: string;
let requestSeq = 0;
let busy = false;
let busyAt = 0;

/** Keep what Drawdy hands the driver when it starts (see `activate`). */
export function initHost(ctx: Parameters<DriverModule["activate"]>[0]) {
    issue = ctx.issueCommand;
    makeId = ctx.generateId;
    driverId = ctx.manifest.driverId;
}

export const generateId = () => makeId();

/** busy, unless it has been "busy" for so long that something must have hung */
export const isBusy = () => busy && Date.now() - busyAt < 30000;
export const setBusy = (v: boolean) => {
    busy = v;
    if (v) busyAt = Date.now();
};

const nextRequestId = () => String(requestSeq++);

/** Issue a command and return the error message, or null on success. */
export async function run(
    type: string,
    req: unknown
): Promise<{ error: string | null; value: any }> {
    const r: any = await issue({
        type,
        driverId,
        requestId: nextRequestId(),
        req,
    } as any);
    const err = r?.res?.error;
    return {
        error: err ? `${err.type}: ${err.message ?? ""}` : null,
        value: r?.res?.value,
    };
}

/** Put a short status note on the board (errors, hints). */
export async function note(text: string, x: number, y: number, fill = "#fde68a") {
    // size the note to its text (about 36 characters per line at 14px)
    const rows = text
        .split("\n")
        .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 36)), 0);
    const height = Math.max(170, 50 + rows * 24);
    await run("command:scene:add-drawdy-elements", {
        elements: [
            {
                type: "shape",
                componentType: "sticky-note",
                drawdyElementId: generateId(),
                x,
                y,
                width: 320,
                height,
                text,
                fontSize: 14,
                fillColor: fill,
            },
        ],
    });
}
