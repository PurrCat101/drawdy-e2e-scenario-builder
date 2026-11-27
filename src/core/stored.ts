// Is the data kept on a drawn element still true for what the board shows? A copied
// element keeps its data, so it is checked before it is used (DRV-62). Pure logic.

import type { Flow } from "./flow";
import type { Scenario } from "./scenarios";
import { noteLines } from "./scenarioText";

export type StoredPath = [number, string | null][];

/** A short fingerprint of a flow, the same however its keys are ordered. */
export function flowKey(flow: Flow): string {
    const text = JSON.stringify(flow, (_, v) =>
        v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v
    );
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** Does every stop of the path exist in the flow? */
export function pathFits(flow: Flow | undefined, path: unknown): path is StoredPath {
    if (!flow?.steps?.length || !Array.isArray(path) || !path.length) return false;
    return path.every((p) => {
        const step = Array.isArray(p) ? flow.steps[p[0] as number] : undefined;
        return !!step && (p[1] === null || step.conds.some((c) => c.id === p[1]));
    });
}

/** The lines that describe the walk: no blank lines, comments or @title. */
const walkLines = (lines: string[]) => lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^@title\b/i.test(l));

/**
 * Does a scenario note's text still say the scenario stored on it? The ID in its title
 * and its steps and choices, with their fields, must be those of `path` in `flow`.
 */
export function noteMatches(text: string, flow: Flow | undefined, id: unknown, path: unknown): boolean {
    if (!pathFits(flow, path)) return false;
    const title = text.match(/^\s*@title\s+(\S+)/im)?.[1];
    if (title !== id) return false;
    const sc: Scenario = {
        n: 0,
        id: String(id),
        type: "happy",
        pri: 2,
        loops: 0,
        path: path.map(([i, cid]) => ({ i, c: flow!.steps[i].conds.find((c) => c.id === cid) ?? null })),
    };
    return walkLines(text.split("\n")).join("\n") === walkLines(noteLines(sc, flow!)).join("\n");
}
