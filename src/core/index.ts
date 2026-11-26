// The core: everything that turns a written flow into scenarios, test steps and tables,
// with no drawing and no host. The Drawdy extension (src/*.ts outside this folder) and any
// other front end (a web page) use only this file. Data goes in and comes out as plain
// values that survive JSON.stringify, so the core also runs in a web worker.
//
// Nothing in this folder may import from outside it, from `@drawdy/*`, from `node:*`, or use
// the browser or Node globals: test/core.test.ts checks that (CORE-01).

import type { Flow, Mode } from "./flow";
import { parseFlowText } from "./syntax";
import { analyze } from "./analysis";
import { scenarioFlow } from "./scenarioFlow";
import { buildDecisionTable, decisionToTsv } from "./decisionTable";
import { MODE_LABEL, noteLines, orderScenarios, reportHeader } from "./scenarioText";
import { flowStepsToTsv, scenarioRows, scenariosToTsv, type Row } from "./testSteps";

export type { Flow, Step, Cond, CondAction, Mode } from "./flow";
export { modeOr } from "./flow";
export type { Scenario, Generated, Issue } from "./scenarios";
export type { Analysis, Counts } from "./analysis";
export type { DecisionTable } from "./decisionTable";
export type { Row, ScenarioItem } from "./testSteps";
export { parseFlowText, formatFlow, hasMarker } from "./syntax";
export { analyze, clearCache } from "./analysis";
export { generate, pick } from "./scenarios";
export { scenarioFlow } from "./scenarioFlow";
export { buildDecisionTable, decisionToTsv, MAX_DECISION_SCENARIOS } from "./decisionTable";
export { MODE_LABEL, noteLines, orderScenarios, reportHeader, coverageLines, requirementLines } from "./scenarioText";
export { STEP_COLUMNS, STEPS_LIST_COLUMNS, scenarioRows, flowStepRows, flowStepsToTsv, scenariosToTsv } from "./testSteps";
export { previewOf } from "./preview";
export { TEMPLATES, templateById, type Template } from "./templates";

/** One scenario, ready to show: its facts, its note text and the rows of its test steps. */
export type ScenarioView = {
    id: string;
    type: "happy" | "neg";
    priority: number;
    loops: number;
    /** the choices taken, in order, as their labels */
    choices: string[];
    /** the lines of its note, in the flow syntax */
    note: string[];
    /** the test steps, one row per step and choice taken */
    rows: Row[];
};

export type Report = {
    flow: Flow;
    /** problems found while reading the text */
    warnings: string[];
    mode: Mode;
    modeLabel: string;
    /** how many scenarios each mode picks */
    counts: { all: number; pair: number; min: number };
    /** the flow check */
    issues: { lv: "err" | "warn"; msg: string }[];
    /** the header lines of the scenario report: counts, coverage, requirements, tip */
    header: string[];
    scenarios: ScenarioView[];
    /** the copied text: test steps, one row per step, the scenario ID first */
    stepsTsv: string;
    /** the copied text of the decision table, null when no step has two or more choices */
    decisionTsv: string | null;
    /** every step and choice of the whole flow as text for a spreadsheet, with a Req column */
    stepsListTsv: string;
    /** false when a very big flow was only searched in part, so counts may grow */
    complete: boolean;
};

/**
 * Everything a front end shows for a flow text and a mode, in one call.
 * `budgetMs` limits the search past 1,000 paths (default: a button press).
 */
export function buildReport(text: string, mode: Mode = "pair", budgetMs?: number): Report {
    const parsed = parseFlowText(text);
    const flow = parsed.flow;
    if (!flow.steps.length)
        return {
            flow,
            warnings: parsed.warnings,
            mode,
            modeLabel: MODE_LABEL[mode],
            counts: { all: 0, pair: 0, min: 0 },
            issues: [],
            header: [],
            scenarios: [],
            stepsTsv: "",
            decisionTsv: null,
            stepsListTsv: "",
            complete: true,
        };
    const a = analyze(flow, budgetMs);
    const picked = a.pick(mode);
    const shown = orderScenarios(picked);
    const counts = a.counts();
    const issues = a.issues();
    const views: ScenarioView[] = shown.map((sc) => {
        const one = scenarioFlow(
            flow,
            sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null])
        );
        return {
            id: sc.id,
            type: sc.type,
            priority: sc.pri,
            loops: sc.loops,
            choices: sc.path.filter((v) => v.c).map((v) => v.c!.label),
            note: noteLines(sc, flow),
            rows: scenarioRows(one),
        };
    });
    const items = shown.map((sc) => ({
        title: sc.id,
        flow: scenarioFlow(
            flow,
            sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null])
        ),
    }));
    const dt = buildDecisionTable(flow, picked);
    return {
        flow,
        warnings: parsed.warnings,
        mode,
        modeLabel: MODE_LABEL[mode],
        counts,
        issues,
        header: reportHeader({ flow, mode, shown, gen: a.gen, counts, issues }),
        scenarios: views,
        stepsTsv: scenariosToTsv(items),
        decisionTsv: dt.conditions.length ? decisionToTsv(dt) : null,
        stepsListTsv: flowStepsToTsv(flow),
        complete: a.complete,
    };
}
