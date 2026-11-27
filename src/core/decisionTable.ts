// The decision table of a flow: every step with its choices as rows, the scenarios of
// a mode as columns. Pure logic; drawing it is decisionBoard.ts.

import type { Flow } from "./flow";
import type { Scenario } from "./scenarios";
import { orderScenarios } from "./scenarioText";

/** A choice of a step. A step without choices has one value, `id` null and no label. */
export type DtValue = { id: string | null; label: string };
export type DtCondition = {
    /** index of the step in the flow */
    step: number;
    name: string;
    values: DtValue[];
};
export type DtColumn = {
    id: string;
    type: "happy" | "neg";
    pri: number;
    /** the scenario's path as `[step index, choice id | null]`, as a scenario note keeps it */
    path: [number, string | null][];
};

export type DecisionTable = {
    /** Happy scenarios first (the group Success), then Negative */
    columns: DtColumn[];
    /** how many columns are Happy */
    success: number;
    /** one for every step of the flow (CALC-90) */
    conditions: DtCondition[];
    /** whether any step has two or more choices; without one there is nothing to decide */
    decides: boolean;
    /** marks[condition][value][column] */
    marks: boolean[][][];
};

/** Most scenarios one decision table is made for (a column each). */
export const MAX_DECISION_SCENARIOS = 60;

export function buildDecisionTable(flow: Flow, scenarios: Scenario[]): DecisionTable {
    // CALC-91: the order of the scenario notes (OUT-22)
    const cols = orderScenarios(scenarios);
    const columns: DtColumn[] = cols.map((s) => ({
        id: s.id,
        type: s.type,
        pri: s.pri,
        path: s.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null]),
    }));

    // CALC-90: every step; one without choices has itself as its only value
    const conditions: DtCondition[] = flow.steps.map((s, i) => ({
        step: i,
        name: s.name,
        values: s.conds.length ? s.conds.map((c) => ({ id: c.id, label: c.label })) : [{ id: null, label: "" }],
    }));

    // CALC-92: marked when the scenario takes the choice at least once, or, for a step
    // without choices, passes through the step
    const marks = conditions.map((cd) =>
        cd.values.map((v) => cols.map((s) => s.path.some((p) => p.i === cd.step && (v.id === null || p.c?.id === v.id))))
    );

    return {
        columns,
        success: columns.filter((c) => c.type === "happy").length,
        conditions,
        decides: flow.steps.some((s) => s.conds.length >= 2),
        marks,
    };
}

const q =(v: string) => (/[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/**
 * The table as tab-separated text, for a spreadsheet: the scenario IDs as the column
 * heads (the same as on the board), a group row and the values with an X.
 */
export function decisionToTsv(t: DecisionTable): string {
    const rows: string[][] = [];
    rows.push(["Condition", "Combination", ...t.columns.map((c) => c.id)]);
    rows.push(["", "Group", ...t.columns.map((c) => (c.type === "happy" ? "Success" : "Negative"))]);
    t.conditions.forEach((cd, ci) =>
        cd.values.forEach((v, vi) =>
            rows.push([
                vi === 0 ? `${cd.step + 1}. ${cd.name}` : "",
                v.label,
                ...t.columns.map((_, k) => (t.marks[ci][vi][k] ? "X" : "")),
            ])
        )
    );
    return rows.map((r) => r.map(q).join("\t")).join("\n");
}
