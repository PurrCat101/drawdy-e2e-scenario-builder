// The live preview of a flow text: scenario counts and flow problems, kept light.
// Pure logic, so the extension's panel and any other front end can use it.

import { parseFlowText } from "./syntax";
import { analyze, PREVIEW_BUDGET_MS } from "./analysis";
import { coverageLines } from "./scenarioText";

/** Above this many scenarios, the live preview skips the coverage safety net. */
const SAFETY_NET_MAX = 300;

/**
 * Scenario counts and flow problems for a text, for the live preview. Kept light:
 * the search past 1,000 paths gets a short budget, and the coverage safety net runs
 * only for flows of a moderate size (the scenario frame always reports coverage).
 */
export function previewOf(text: string) {
    const t0 = Date.now();
    const r = parseFlowText(text);
    const flow = r.flow;
    const reading = r.warnings.slice(0, 4);
    if (!flow.steps.length) return { counts: null, steps: 0, issues: reading, ms: Date.now() - t0 };
    const a = analyze(flow, PREVIEW_BUDGET_MS);
    const gen = a.gen;
    const counts = a.counts();
    // a safety net: each mode must keep its promise; say so loudly if one does not
    const broken =
        gen.list.length > SAFETY_NET_MAX
            ? []
            : (["ep", "pair", "min"] as const).flatMap((m) =>
                  coverageLines(a.pick(m), gen, m)
                      .filter((l) => l.startsWith("MISSING"))
                      .map((l) => `ERROR: ${m.toUpperCase()} ${l}`)
              );
    // said first, so the panel never folds it away
    const limit = !gen.capped
        ? []
        : [
              gen.searchComplete === false || gen.pairsComplete === false
                  ? "Too big to list every path: some choices or pairs may be missing (see the flow check)."
                  : "Too big to list every path. Pair and Each still cover the flow; add needs / sets to cut paths.",
          ];
    return {
        steps: flow.steps.length,
        capped: gen.capped,
        counts,
        ms: Date.now() - t0,
        issues: [
            ...broken,
            ...limit,
            ...(a.complete
                ? []
                : ["INFO: a very big flow: these counts are what a quick search found; the full search runs when you press a button."]),
            ...reading,
            a.tip(),
            ...a.issues()
                .slice(0, 3)
                .map((i) => (i.lv === "err" ? "ERROR: " : "WARN: ") + i.msg),
        ],
    };
}
