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

/** The requirement IDs of a step and of the choice taken, each once, in the order written. */
function reqsOf(step?: string, choice?: string): string {
    const out: string[] = [];
    for (const r of [step, choice])
        for (const t of String(r ?? "").split(/[,;]/)) {
            const id = t.trim();
            if (id && !out.includes(id)) out.push(id);
        }
    return out.join(", ");
}

/** One row per choice taken (a step without choices is one row). */
export function scenarioRows(flow: Flow): Row[] {
    const rows: Row[] = [];
    flow.steps.forEach((s, i) => {
        const base = { step: `${i + 1}. ${s.name}` };
        if (!s.conds.length)
            rows.push({ ...base, cond: "", pre: join(s.pre), data: join(s.data), exp: join(s.exp), req: reqsOf(s.req) });
        else
            for (const c of s.conds)
                rows.push({
                    ...base,
                    cond: c.label + (c.action === "end" ? "  ✖" : c.action === "loop" ? "  ↻" : ""),
                    pre: join(s.pre, c.pre),
                    data: join(s.data, c.data),
                    exp: join(s.exp, c.exp),
                    req: reqsOf(s.req, c.req),
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

/** The columns of the steps list of a whole flow: those of a test steps table, then Req. */
export const STEPS_LIST_COLUMNS: { key: string; title: string }[] = [...STEP_COLUMNS, { key: "req", title: "Req" }];

/**
 * Every step of a flow and every choice of it, as rows: one row per choice (a step with
 * no choice is one row). Not a scenario: nothing says which path takes which row.
 */
export const flowStepRows = (flow: Flow): Row[] => scenarioRows(flow);

/** The steps list of a flow as text for a spreadsheet: tab-separated, one header row. */
export function flowStepsToTsv(flow: Flow): string {
    const q = (v: string) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    const rows: string[][] = [STEPS_LIST_COLUMNS.map((c) => c.title)];
    for (const r of flowStepRows(flow)) rows.push(STEPS_LIST_COLUMNS.map((c) => r[c.key] ?? ""));
    return rows.map((r) => r.map(q).join("\t")).join("\n");
}
