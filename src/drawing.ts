import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import type { Flow, Mode } from "./core/flow";
import { renderFlow } from "./render";
import { VIA_NEGATIVE } from "./core/scenarios";
import { analyze } from "./core/analysis";
import { renderScenarios } from "./scenarioBoard";
import { renderScenarioTables, type ScenarioItem } from "./scenarioTable";
import { generateId, note, run } from "./host";
import { findFree, frameSize, occupiedRects, type Box } from "./selection";

/** Putting things on the board: the flow diagram, the scenario frame, the tables. */

/** Draw a flow diagram under `anchor`. Returns the frame's box, or null. */
export async function drawFlow(
    flow: Flow,
    anchor: Box,
    opts: { name?: string; success?: boolean; at?: [number, number] } = {}
): Promise<(Box & { id: string }) | null> {
    // measure first, then look for room: the diagram goes under the anchor
    // unless something is already there
    const size = frameSize(renderFlow(flow, generateId, [0, 0], opts).elements);
    const [wantX, wantY] = opts.at ?? [anchor.x, anchor.y + anchor.height + 120];
    const origin = findFree(await occupiedRects(), wantX, wantY, size.w, size.h);
    const out = renderFlow(flow, generateId, origin, opts);
    const add = await run("command:scene:add-drawdy-elements", {
        elements: out.elements,
    });
    if (add.error) {
        await note(`Could not draw the flow\n${add.error}`, anchor.x, anchor.y - 200, "red");
        return null;
    }
    // label the arrows (the create schema has no text field for arrows)
    const upd = await run("command:scene:update-drawdy-elements", {
        updates: out.labels.map((l) => ({
            drawdyElementId: l.arrowId,
            properties: { text: l.text },
        })),
    });
    if (upd.error) {
        await run("command:scene:add-drawdy-elements", {
            elements: out.labels.map((l) => ({
                type: "text",
                drawdyElementId: generateId(),
                frameId: out.frameId,
                x: l.mid[0] - 60,
                y: l.mid[1],
                text: l.text,
                fontSize: 12,
                color: l.color,
                textAlign: "center",
            })),
        });
    }
    const fr: any = out.elements[0];
    return {
        id: out.frameId,
        x: fr.position[0],
        y: fr.position[1],
        width: fr.width,
        height: fr.height,
    };
}

/**
 * Add many elements in small batches, the frame first (a big batch is easier to
 * lose). Returns an error text, or "" when everything was added.
 */
export async function addInBatches(elements: DrawdyElementSchema[], size = 30): Promise<string> {
    for (let i = 0; i < elements.length; i += size) {
        const r = await run("command:scene:add-drawdy-elements", { elements: elements.slice(i, i + size) });
        if (r.error) return `${r.error} (batch ${Math.floor(i / size) + 1})`;
    }
    return "";
}

export const scenarioPath = (sc: { path: { i: number; c: { id: string } | null }[] }) =>
    sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null]);

/** Title of a scenario in the tables: id, kind, priority and the choices it takes. */
export function scenarioTitle(id: string, type: string, pri: string | number | undefined, sub: Flow): string {
    const picks = sub.steps.flatMap((s) => s.conds.map((c) => c.label)).join(" · ");
    const via = type === "happy" && sub.steps.some((s) => s.conds.some((c) => c.neg && c.action !== "end"));
    return `${id} · ${type === "happy" ? "Happy" : "Negative"}${pri ? " · P" + pri : ""}${via ? " · " + VIA_NEGATIVE : ""}${picks ? "   " + picks : ""}`;
}

/** The table of one case (step, condition, setup, test data, expected), below its flow drawing. */
export async function drawScenarioTable(flow: Flow, name: string, below: Box) {
    const one: ScenarioItem[] = [{ title: name, flow }];
    const size = renderScenarioTables({ scenarios: one, name, origin: [0, 0], generateId });
    const origin = findFree(await occupiedRects(), below.x, below.y + below.height + 100, size.width, size.height);
    const out = renderScenarioTables({ scenarios: one, name: `${name} · table`, origin, generateId });
    const failed = await addInBatches(out.elements);
    if (failed) await note(`Could not draw the scenario table
${failed}`, below.x, below.y - 200, "red");
}

/** Generate the scenarios for `flow` below `below` and fly to them. */
export async function drawScenarios(flow: Flow, mode: Mode, below: Box) {
    // usually already worked out by the panel's preview of the same flow
    const a = analyze(flow);
    const gen = a.gen;
    const shown = a.pick(mode);
    const issues = a.issues();
    // the four numbers side by side, to compare the modes
    const counts = a.counts();
    const base = { flow, mode, shown, gen, issues, counts, generateId };
    const size = frameSize(renderScenarios({ ...base, origin: [0, 0] }).elements);
    const origin = findFree(
        await occupiedRects(),
        below.x,
        below.y + below.height + 120,
        size.w,
        size.h
    );
    const out = renderScenarios({ ...base, origin });
    const add = await run("command:scene:add-drawdy-elements", {
        elements: out.elements,
    });
    if (add.error) {
        await note(`Could not draw scenarios\n${add.error}`, below.x, below.y - 200, "red");
        return;
    }
    await run("command:camera:fly-to-elements", {
        drawdyElementIds: [out.frameId],
        flyDurationMs: 400,
        zoom: 0.4,
    });
}
