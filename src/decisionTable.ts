// The decision table of a flow: the steps that decide (two or more choices) as rows,
// the scenarios of a mode as columns. Pure logic; drawing it is decisionBoard.ts.

import type { Flow } from "./flow";
import type { Scenario } from "./scenarios";
import { orderScenarios } from "./scenarioBoard";

export type DtValue = { id: string; label: string };
export type DtCondition = {
    /** index of the step in the flow */
    step: number;
    name: string;
    values: DtValue[];
};
export type DtColumn = { id: string; type: "happy" | "neg"; pri: number };

export type DecisionTable = {
    /** Happy scenarios first (the group Success), then Negative */
    columns: DtColumn[];
    /** how many columns are Happy */
    success: number;
    conditions: DtCondition[];
    /** marks[condition][value][column] */
    marks: boolean[][][];
};

/** Most scenarios one decision table is made for (a column each). */
export const MAX_DECISION_SCENARIOS = 60;

export function buildDecisionTable(flow: Flow, scenarios: Scenario[]): DecisionTable {
    // CALC-91: the order of the scenario notes (OUT-22)
    const cols = orderScenarios(scenarios);
    const columns: DtColumn[] = cols.map((s) => ({ id: s.id, type: s.type, pri: s.pri }));

    // CALC-90: a condition is a step with two or more choices
    const conditions: DtCondition[] = [];
    flow.steps.forEach((s, i) => {
        if (s.conds.length >= 2)
            conditions.push({
                step: i,
                name: s.name,
                values: s.conds.map((c) => ({ id: c.id, label: c.label })),
            });
    });

    // CALC-92: marked when the scenario takes the choice at least once
    const marks = conditions.map((cd) =>
        cd.values.map((v) => cols.map((s) => s.path.some((p) => p.i === cd.step && p.c && p.c.id === v.id)))
    );

    return {
        columns,
        success: columns.filter((c) => c.type === "happy").length,
        conditions,
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
