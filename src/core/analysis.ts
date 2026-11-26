// One place that works out everything about a flow (its paths, the scenarios of
// each mode, the flow check, the counts) and remembers it. The panel asks for the
// same flow many times: on every edit of the paste box, on every poll while a flow
// note is selected, and again when a button is pressed. A big flow can take a second
// or more, so a flow already seen is answered from memory.

import type { Flow, Mode } from "./flow";
import { generate, pick, validate, type Generated, type Issue, type Scenario } from "./scenarios";

export type Counts = { all: number; pair: number; min: number };

export type Analysis = {
    flow: Flow;
    gen: Generated;
    /** the time budget the search past 1,000 paths had */
    budgetMs: number;
    /** how long working out the paths took */
    ms: number;
    /** false when the search past 1,000 paths stopped at its budget: counts may grow */
    complete: boolean;
    /** the scenarios of a mode, worked out once */
    pick(mode: Mode): Scenario[];
    counts(): Counts;
    issues(): Issue[];
};

/** How many flows to remember: the panel's text, the selected note, a few recent ones. */
const SIZE = 8;
const cache = new Map<string, Analysis>();
let hits = 0;
let misses = 0;

/** The search budget for a button press (the full answer). */
export const FULL_BUDGET_MS = 3000;
/** The search budget for the panel's live counts, while the writer is typing. */
export const PREVIEW_BUDGET_MS = 300;

function build(flow: Flow, budgetMs: number): Analysis {
    const t0 = Date.now();
    const gen = generate(flow, 1000, budgetMs);
    const ms = Date.now() - t0;
    const picks = new Map<Mode, Scenario[]>();
    let counts: Counts | null = null;
    let issues: Issue[] | null = null;
    const a: Analysis = {
        flow,
        gen,
        budgetMs,
        ms,
        complete: gen.searchComplete !== false,
        pick(mode) {
            let s = picks.get(mode);
            if (!s) {
                s = pick(gen, mode);
                picks.set(mode, s);
            }
            return s;
        },
        counts() {
            return (counts ??= {
                all: gen.list.length,
                pair: a.pick("pair").length,
                min: a.pick("min").length,
            });
        },
        issues() {
            return (issues ??= validate(flow, gen));
        },
    };
    return a;
}

/**
 * The analysis of `flow`, from memory when the same flow (same steps, choices and
 * fields) was seen recently. Keep the result read-only: it is shared.
 *
 * `budgetMs` limits the search past 1,000 paths. A remembered answer is used when it
 * is complete, or had at least this budget; a quick preview of a huge flow is
 * worked out again in full when a button needs it.
 */
export function analyze(flow: Flow, budgetMs = FULL_BUDGET_MS): Analysis {
    const key = JSON.stringify(flow);
    const got = cache.get(key);
    if (got && (got.complete || got.budgetMs >= budgetMs)) {
        hits++;
        // most recently used goes last, so the oldest is dropped first
        cache.delete(key);
        cache.set(key, got);
        return got;
    }
    misses++;
    const a = build(flow, budgetMs);
    cache.delete(key);
    cache.set(key, a);
    while (cache.size > SIZE) cache.delete(cache.keys().next().value!);
    return a;
}

/** For tests: how often the memory answered. */
export const cacheStats = () => ({ hits, misses, size: cache.size });
export const clearCache = () => {
    cache.clear();
    hits = misses = 0;
};
