// The test steps of a scenario as rows and as text for a spreadsheet: for every step it
// passes, the choice taken, its setup, test data and expected result. No drawing here.

import type { Flow } from "./flow";

/** The columns of a test steps table: the key of a row's field and the heading. */
export const STEP_COLUMNS: { key: string; title: string }[] = [
    { key: "n", title: "#" },
    { key: "step", title: "Step" },
    { key: "cond", title: "Condition" },
    { key: "pre", title: "Setup" },
    { key: "data", title: "Test data" },
    { key: "exp", title: "Expected result" },
];

const join = (...xs: (string | undefined)[]) =>
    xs
        .map((x) => (x ?? "").trim())
        .filter(Boolean)
        .join("\n");

export type Row = Record<string, string>;

/** One row per choice taken (a step without choices is one row). */
export function scenarioRows(flow: Flow): Row[] {
    const rows: Row[] = [];
    flow.steps.forEach((s, i) => {
        const base = { step: `${i + 1}. ${s.name}` };
        if (!s.conds.length)
            rows.push({ ...base, cond: "", pre: join(s.pre), data: join(s.data), exp: join(s.exp) });
        else
            for (const c of s.conds)
                rows.push({
                    ...base,
                    cond: c.label + (c.action === "end" ? "  ✖" : c.action === "loop" ? "  ↻" : ""),
                    pre: join(s.pre, c.pre),
                    data: join(s.data, c.data),
                    exp: join(s.exp, c.exp),
                });
    });
    rows.forEach((r, k) => (r.n = String(k + 1)));
    return rows;
}

export type ScenarioItem = { title: string; flow: Flow };

/** The scenarios as text for a spreadsheet: tab-separated, a Scenario column first, one header row. */
export function scenariosToTsv(scenarios: ScenarioItem[]): string {
    const q = (v: string) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const rows: string[][] = [["Scenario", ...STEP_COLUMNS.map((c) => c.title)]];
    for (const cs of scenarios) {
        const id = cs.title.split("   ")[0];
        for (const r of scenarioRows(cs.flow)) rows.push([id, ...STEP_COLUMNS.map((c) => r[c.key] ?? "")]);
    }
    return rows.map((r) => r.map(q).join("\t")).join("\n");
}
