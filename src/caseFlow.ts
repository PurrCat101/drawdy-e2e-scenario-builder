// Turning one scenario into a flow of its own. Pure logic, no Drawdy imports.

import type { Cond, Flow } from "./flow";

/** The flow reduced to the steps and conditions one scenario passes through. */
export function caseFlow(flow: Flow, path: [number, string | null][]): Flow {
    const usedConds: Record<number, Set<string>> = {};
    path.forEach(([i, cid]) => {
        (usedConds[i] = usedConds[i] || new Set()).add(cid ?? "");
    });
    const idx = Object.keys(usedConds)
        .map(Number)
        .sort((a, b) => a - b);
    return {
        steps: idx.map((i) => {
            const s = flow.steps[i];
            return {
                id: s.id,
                name: s.name,
                data: s.data,
                exp: s.exp,
                pre: s.pre,
                req: s.req,
                conds: s.conds.filter((c) => usedConds[i].has(c.id)),
            };
        }),
    };
}

/** Does the scenario end in a failure (its last condition ends the flow)? */
export function pathFails(flow: Flow, path: [number, string | null][]): boolean {
    const last = path[path.length - 1];
    if (!last) return false;
    const c = flow.steps[last[0]]?.conds.find((k) => k.id === last[1]);
    return c?.action === "end";
}

/**
 * Rebuild a case's flow from the text of a scenario note, so a note works even
 * without the data stored on it (notes from older versions, copied notes):
 *
 *   TSS-001 · Happy · P2
 *   1. Login → ok
 *   2. Pick item → shirt
 *   3. Checkout ✖ card declined
 *
 * `→` continues, `↻` loops back to the step on the next line, `✖` ends the
 * flow as a failure. Step names that were shortened with "…" stay shortened.
 */
export function caseFromText(
    text: string
): { flow: Flow; fails: boolean; id: string } | null {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const head = lines[0]?.match(/^(TS[SN]-\d+)/);
    const rows: { n: number; name: string; mark: string; label: string }[] = [];
    for (const l of lines) {
        const m = l.match(/^(\d+)\.\s*(.*?)(?:\s+([→↻✖])\s+(.*))?$/);
        if (m) rows.push({ n: +m[1], name: m[2], mark: m[3] ?? "", label: m[4] ?? "" });
    }
    // it must look like a scenario note: a TS?-### header, or numbered steps with arrows
    if (!rows.length || !(head || rows.some((r) => r.mark))) return null;

    const nums = Array.from(new Set(rows.map((r) => r.n))).sort((a, b) => a - b);
    const idOf = (n: number) => "c" + n;
    const steps = nums.map((n) => {
        const mine = rows.filter((r) => r.n === n);
        const conds: Cond[] = [];
        mine.forEach((r) => {
            if (!r.mark) return;
            const k = rows.indexOf(r);
            const action = r.mark === "→" ? "next" : r.mark === "↻" ? "loop" : "end";
            const label = r.label || "-";
            if (conds.some((c) => c.label === label && c.action === action)) return;
            conds.push({
                id: `c${n}-${conds.length}`,
                label,
                neg: r.mark === "✖",
                action,
                target: action === "loop" ? idOf(rows[k + 1]?.n ?? n) : null,
                max: 1,
                tags: "",
                need: "",
                pri: "",
                variant: false,
            });
        });
        return { id: idOf(n), name: mine[0].name, conds };
    });
    return {
        flow: { steps },
        fails: rows[rows.length - 1].mark === "✖",
        id: head ? head[1] : "case",
    };
}
