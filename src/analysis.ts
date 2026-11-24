// One place that works out everything about a flow (its paths, the scenarios of
// each mode, the flow check, the counts) and remembers it. The panel asks for the
// same flow many times: on every edit of the paste box, on every poll while a flow
// note is selected, and again when a button is pressed. A big flow can take a second
// or more, so a flow already seen is answered from memory.

import type { Flow, Mode } from "./flow";
import { generate, modeTip, pick, validate, type Generated, type Issue, type Scenario } from "./scenarios";

export type Counts = { all: number; ep: number; pair: number; min: number };

export type Analysis = {
    flow: Flow;
    gen: Generated;
    /** the scenarios of a mode, worked out once */
    pick(mode: Mode): Scenario[];
    counts(): Counts;
    issues(): Issue[];
    tip(): string;
};

/** How many flows to remember: the panel's text, the selected note, a few recent ones. */
const SIZE = 8;
const cache = new Map<string, Analysis>();
let hits = 0;
let misses = 0;

function build(flow: Flow): Analysis {
    const gen = generate(flow);
    const picks = new Map<Mode, Scenario[]>();
    let counts: Counts | null = null;
    let issues: Issue[] | null = null;
    const a: Analysis = {
        flow,
        gen,
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
                ep: a.pick("ep").length,
                pair: a.pick("pair").length,
                min: a.pick("min").length,
            });
        },
        issues() {
            return (issues ??= validate(flow, gen));
        },
        tip() {
            return modeTip(flow, a.counts());
        },
    };
    return a;
}

/**
 * The analysis of `flow`, from memory when the same flow (same steps, choices and
 * fields) was seen recently. Keep the result read-only: it is shared.
 */
export function analyze(flow: Flow): Analysis {
    const key = JSON.stringify(flow);
    const got = cache.get(key);
    if (got) {
        hits++;
        // most recently used goes last, so the oldest is dropped first
        cache.delete(key);
        cache.set(key, got);
        return got;
    }
    misses++;
    const a = build(flow);
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
