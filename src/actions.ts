import { modeOr, type Flow, type Mode } from "./core/flow";
import { hasMarker, parseFlowText } from "./core/syntax";
import { renderScenarioTables } from "./scenarioTable";
import { flowStepRows, scenariosToTsv, type ScenarioItem } from "./core/testSteps";
import { analyze } from "./core/analysis";
import { MODE_LABEL, orderScenarios } from "./core/scenarioText";
import { buildDecisionTable, decisionToTsv, MAX_DECISION_SCENARIOS } from "./core/decisionTable";
import { renderDecisionTables } from "./decisionBoard";
import type { Scenario } from "./core/scenarios";
import { scenarioFlow, scenarioFromText, pathFails } from "./core/scenarioFlow";
import type { Template } from "./core/templates";
import { generateId, note, run } from "./host";
import { fitHeight, textBox } from "./textBox";
import { toPanel } from "./webview";
import { flyTo, moved, placeFor, put } from "./placement";
import {
    anchorFor,
    currentSelectionIds,
    readElements,
    tableCount,
    type Box,
    type Picked,
} from "./selection";
import {
    addInBatches,
    drawFlow,
    drawScenarioTable,
    drawScenarios,
    scenarioPath,
    scenarioTitle,
} from "./drawing";

/** What the panel's buttons do: draw flows, scenarios and tables, copy a table, add a starter note. */

/** Draw a flow (and its scenarios) from a model. Returns a status line. */
async function drawFromFlow(
    kind: "board" | "flow" | "scenarios",
    flow: Flow,
    mode: Mode,
    anchor: Box
): Promise<string> {
    if (kind === "scenarios") {
        // the scenarios only, no flow diagram
        await drawScenarios(flow, mode, anchor);
        return "Scenarios drawn";
    }
    const box = await drawFlow(flow, anchor);
    if (!box) return "Could not draw the flow (see the note on the board)";
    if (kind === "flow") {
        await flyTo([box.id], 0.5);
        return `Flow drawn (${flow.steps.length} steps)`;
    }
    await drawScenarios(flow, mode, box);
    return "Flow and scenarios drawn";
}

/** Draw from text typed in the panel. Returns a status line for the panel. */
export async function drawFromText(
    kind: "board" | "flow" | "scenarios",
    text: string,
    uiMode: Mode
): Promise<string> {
    const sel = await readElements(await currentSelectionIds());
    const r = parseFlowText(text);
    // a mode written in a compact text (@pair ...) wins over the panel's switch
    const mode: Mode = r.mode ?? uiMode;
    if (!r.flow.steps.length) return "Cannot read the flow; check the syntax";
    const done = await drawFromFlow(kind, r.flow, mode, await anchorFor(sel));
    return r.warnings.length ? `${done} (${r.warnings.length} warnings, see the panel)` : done;
}

/** Width of a starter note: wide enough that the comment lines do not wrap much. */
const TEMPLATE_W = 520;

/**
 * Drop a starter note (a ready-made `@builder` text) on the board, where the placing
 * switch says (placement.ts). The writer edits it on the board, where there is
 * room, then selects it and presses Flow + Scenarios.
 */
export async function addTemplateNote(t: Template): Promise<string> {
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    // a filled text box, as tall as its text needs (OUT-40, OUT-50)
    const height = fitHeight(t.text, TEMPLATE_W, 14);
    const [x, y] = await placeFor(r.x + 60, r.y + 60, TEMPLATE_W, height);
    const id = generateId();
    const box = textBox({ id, x, y, width: TEMPLATE_W, height, text: t.text, fontSize: 14, tone: "yellow" });
    const failed = await put(async (dx, dy) => {
        const add = await run("command:scene:add-drawdy-elements", { elements: moved([box], dx, dy) });
        return add.error ?? "";
    });
    if (failed) return "Could not add the starter note: " + failed;
    await flyTo([id], 0.5);
    return `Starter note added. Edit it on the board, then select it and press Flow + Scenarios`;
}

/**
 * Button 3: the test sequence of many scenarios as tables (step, condition, setup,
 * test data, expected result), to check them against the flow. From the text in
 * the panel, from a selected scenario frame (all its scenarios) or from selected
 * scenario notes.
 */
type Collected = { scenarios: ScenarioItem[]; anchor: Box; label: string };

/** The scenarios to show as tables: the selection on the board wins over the panel's text. */
async function collectScenarios(text: string, uiMode: Mode): Promise<Collected | string> {
    const sel = await readElements(await currentSelectionIds());
    const scenarios: ScenarioItem[] = [];
    let anchor: Box | null = null;
    let label = "Test steps";
    const fromList = (flow: Flow, mode: Mode) => {
        for (const sc of orderScenarios(analyze(flow).pick(mode))) {
            const sub = scenarioFlow(flow, scenarioPath(sc));
            scenarios.push({ title: scenarioTitle(sc.id, sc.type, sc.pri, sub), flow: sub });
        }
    };
    const frame = sel.find((p) => p.meta?.e2eScenarios && p.meta?.flow);
    const scenarioNotes = sel.filter((x) => x.meta?.kind === "scenario" && Array.isArray(x.meta.path));
    const flowNotes = sel.filter((x) => !x.meta?.kind && x.text.trim() && hasMarker(x.text));
    const flowFrame = sel.find((x) => x.meta?.e2eFlow);
    if (frame) {
        const mode = modeOr(frame.meta.mode, uiMode);
        fromList(frame.meta.flow as Flow, mode);
        anchor = frame;
        label = `Test steps · ${mode.toUpperCase()}`;
    } else if (scenarioNotes.length) {
        let unknown = 0;
        for (const p of scenarioNotes) {
            const fr = p.frameId ? (await readElements([p.frameId]))[0] : undefined;
            const flow = fr?.meta?.flow as Flow | undefined;
            if (!flow?.steps?.length) {
                unknown++;
                continue;
            }
            const sub = scenarioFlow(flow, p.meta.path as [number, string | null][]);
            const pri = p.meta.pri ?? p.text.match(/·\s*P(\d)/)?.[1];
            scenarios.push({ title: scenarioTitle(String(p.meta.id), String(p.meta.type), pri, sub), flow: sub });
            anchor = anchor ?? p;
        }
        // DRV-59: a head of a table drawn by an older version has no flow to go back to
        if (unknown && !scenarios.length)
            return "Could not read: the selected scenarios no longer know their flow (a table drawn by an older version); draw it again";
    } else if (flowNotes.length) {
        for (const p of flowNotes) {
            const r = parseFlowText(p.text);
            if (!r.flow.steps.length) continue;
            fromList(r.flow, r.mode ?? uiMode);
            anchor = anchor ?? p;
        }
        label = `Test steps · ${uiMode.toUpperCase()}`;
    } else if (flowFrame) {
        fromList(flowFrame.meta.e2eFlow as Flow, uiMode);
        anchor = flowFrame;
        label = `Test steps · ${uiMode.toUpperCase()}`;
    } else if (text) {
        const r = parseFlowText(text);
        if (!r.flow.steps.length) return "Cannot read the flow; check the syntax";
        const mode = r.mode ?? uiMode;
        fromList(r.flow, mode);
        anchor = await anchorFor(sel);
        label = `Test steps · ${mode.toUpperCase()}`;
    }
    if (!scenarios.length || !anchor)
        return "Write a flow in the box first, or select a scenario frame / scenario note on the board";
    return { scenarios, anchor, label };
}

/**
 * Button 3: the test sequence of many scenarios as tables (step, condition, setup,
 * test data, expected result), to check them against the flow.
 */
export async function tableAction(text: string, uiMode: Mode): Promise<string> {
    const got = await collectScenarios(text, uiMode);
    if (typeof got === "string") return got;
    const { scenarios, anchor, label } = got;
    const size = renderScenarioTables({ scenarios, name: label, origin: [0, 0], generateId });
    const origin = await placeFor(anchor.x, anchor.y + anchor.height + 120, size.width, size.height);
    const out = renderScenarioTables({ scenarios, name: `${label} · ${scenarios.length} scenarios`, origin, generateId });
    const failed = await put((dx, dy) => addInBatches(moved(out.elements, dx, dy)));
    if (failed) return "Could not draw the table: " + failed;
    await flyTo([out.frameId], 0.3);
    return `Table drawn (${scenarios.length} scenarios)`;
}

/**
 * Button 4: the same scenarios as tab-separated text, sent to the panel, which puts it
 * on the clipboard (a click in the panel is a real user action; the board's embedded
 * pages cannot reliably write to the clipboard).
 */
export async function copyAction(text: string, uiMode: Mode): Promise<string> {
    // a table selected on the board (it carries its own text)
    const sel = await readElements(await currentSelectionIds());
    const table = sel.find((p) => typeof p.meta?.tsv === "string");
    if (table) {
        await toPanel({ type: "clip", text: table.meta.tsv, scenarios: tableCount(table.meta), what: table.meta.unit });
        return "";
    }
    const got = await collectScenarios(text, uiMode);
    if (typeof got === "string") return got;
    await toPanel({ type: "clip", text: scenariosToTsv(got.scenarios), scenarios: got.scenarios.length });
    return "";
}

/** Said when a decision table is made for a flow with nothing to decide (CALC-94). */
const NOTHING_TO_DECIDE = "Warning: no step has two or more choices, so there is nothing to decide";

/**
 * Copy decision table: the text of the decision table (CALC-90 to 94) of the scenarios
 * chosen as for the Decision table button, without drawing it and without the limit of
 * MAX_DECISION_SCENARIOS (DRV-58). One long row of scenarios, for a spreadsheet.
 */
export async function copyDecisionAction(text: string, uiMode: Mode): Promise<string> {
    const got = await collectDecision(text, uiMode);
    if (typeof got === "string") return got;
    const parts: string[] = [];
    let n = 0;
    let warn = false;
    for (const src of got) {
        const dt = buildDecisionTable(src.flow, src.scenarios);
        warn ||= !dt.decides;
        parts.push(decisionToTsv(dt));
        n += dt.columns.length;
    }
    await toPanel({ type: "clip", text: parts.join("\n\n"), scenarios: n, ...(warn ? { warning: NOTHING_TO_DECIDE } : {}) });
    return "";
}

/** A flow and the scenarios to make a decision table of, with where to draw it. */
type DecisionSource = { flow: Flow; scenarios: Scenario[]; mode: Mode; anchor: Box };

/** The same choice as Table (DRV-24), but with the scenarios themselves and their flow. */
async function collectDecision(text: string, uiMode: Mode): Promise<DecisionSource[] | string> {
    const sel = await readElements(await currentSelectionIds());
    const frame = sel.find((p) => p.meta?.e2eScenarios && p.meta?.flow);
    const scenarioNotes = sel.filter((x) => x.meta?.kind === "scenario" && Array.isArray(x.meta.path));
    const flowNotes = sel.filter((x) => !x.meta?.kind && x.text.trim() && hasMarker(x.text));
    const flowFrame = sel.find((x) => x.meta?.e2eFlow);
    const of = (flow: Flow, mode: Mode, anchor: Box): DecisionSource => ({ flow, mode, scenarios: analyze(flow).pick(mode), anchor });
    if (frame) return [of(frame.meta.flow as Flow, modeOr(frame.meta.mode, uiMode), frame)];
    if (scenarioNotes.length) {
        // the notes of the first frame: their flow is stored on it
        const first = scenarioNotes[0];
        const fr = first.frameId ? (await readElements([first.frameId]))[0] : undefined;
        const flow = fr?.meta?.flow as Flow | undefined;
        if (!flow?.steps?.length) return "Could not draw: the selected scenario notes no longer know their flow";
        // the notes' paths, not their IDs, say which scenarios they are: an ID counts within
        // one mode (CALC-57), so it is not unique across modes (OUT-66)
        const mode = modeOr(fr?.meta?.mode, uiMode);
        const key = (path: unknown) => JSON.stringify(path);
        const paths = new Set(scenarioNotes.filter((p) => p.frameId === first.frameId).map((p) => key(p.meta.path)));
        const scenarios = analyze(flow).pick(mode).filter((s) => paths.has(key(scenarioPath(s))));
        if (!scenarios.length) return "Could not draw: the selected scenarios are not in the flow any more";
        return [{ flow, scenarios, mode, anchor: first }];
    }
    if (flowNotes.length) {
        const out: DecisionSource[] = [];
        for (const p of flowNotes) {
            const r = parseFlowText(p.text);
            if (r.flow.steps.length) out.push(of(r.flow, r.mode ?? uiMode, p));
        }
        return out.length ? out : "Cannot read the flow; check the syntax";
    }
    if (flowFrame) return [of(flowFrame.meta.e2eFlow as Flow, uiMode, flowFrame)];
    if (text) {
        const r = parseFlowText(text);
        if (!r.flow.steps.length) return "Cannot read the flow; check the syntax";
        return [of(r.flow, r.mode ?? uiMode, await anchorFor(sel))];
    }
    return "Write a flow in the box first, or select a scenario frame / scenario note on the board";
}

/**
 * Button 4b: the decision table of the same scenarios (CALC-90 to 94), drawn as text
 * boxes below the selection or in view (OUT-60 to 64).
 */
export async function decisionAction(text: string, uiMode: Mode): Promise<string> {
    const got = await collectDecision(text, uiMode);
    if (typeof got === "string") return got;
    let drawn = 0;
    let first = "";
    let warn = false;
    for (const src of got) {
        const dt = buildDecisionTable(src.flow, src.scenarios);
        warn ||= !dt.decides;
        if (dt.columns.length > MAX_DECISION_SCENARIOS)
            return `Could not draw: ${dt.columns.length} scenarios is too many for one decision table (at most ${MAX_DECISION_SCENARIOS}); pick Pair or Each, or press Copy decision table`;
        const name = `Decision table · ${MODE_LABEL[src.mode]}`;
        const size = renderDecisionTables({ table: dt, flow: src.flow, mode: src.mode, name, origin: [0, 0], generateId });
        const origin = await placeFor(src.anchor.x, src.anchor.y + src.anchor.height + 120, size.width, size.height);
        const out = renderDecisionTables({ table: dt, flow: src.flow, mode: src.mode, name, origin, generateId });
        const failed = await put((dx, dy) => addInBatches(moved(out.elements, dx, dy)));
        if (failed) return "Could not draw the decision table: " + failed;
        drawn += dt.columns.length;
        first = first || out.frameIds[0];
    }
    await flyTo([first], 0.3);
    return `Decision table drawn (${drawn} scenarios)` + (warn ? `. ${NOTHING_TO_DECIDE}` : "");
}

/**
 * Steps list: every step and every choice of the whole flow as one table, with a Req
 * column (DRV-61, OUT-67), drawn below the selection. Not scenarios: nothing here depends
 * on the mode, and there is no limit on size.
 */
export async function stepsListAction(text: string, uiMode: Mode): Promise<string> {
    const got = await collectDecision(text, uiMode);
    if (typeof got === "string") return got;
    // one flow, however many of its scenarios or notes are selected
    const flows: DecisionSource[] = [];
    for (const src of got) if (!flows.some((f) => JSON.stringify(f.flow) === JSON.stringify(src.flow))) flows.push(src);
    const scenarios = flows.map((f, k) => ({ title: flows.length > 1 ? `Flow ${k + 1}` : "All steps", flow: f.flow }));
    const steps = scenarios.reduce((a, cs) => a + flowStepRows(cs.flow).length, 0);
    const name = `Steps list · ${steps} ${steps === 1 ? "step" : "steps"}`;
    const anchor = flows[0].anchor;
    const size = renderScenarioTables({ scenarios, name, origin: [0, 0], generateId, stepsList: true });
    const origin = await placeFor(anchor.x, anchor.y + anchor.height + 120, size.width, size.height);
    const out = renderScenarioTables({ scenarios, name, origin, generateId, stepsList: true });
    const failed = await put((dx, dy) => addInBatches(moved(out.elements, dx, dy)));
    if (failed) return "Could not draw the steps list: " + failed;
    await flyTo([out.frameId], 0.3);
    return `Steps list drawn (${steps} steps)`;
}

const HINT_BOARD =
    "Select a sticky note that starts with @builder (or a flow frame already drawn), then press the button again\n\n" +
    "Example:\n@builder\n1. Login\n- ok\n- failed -> end\n2. Checkout\n- paid\n- card declined -> end\n\n" +
    "Notes that do not start with @builder are not read";

/** Button 1: flow diagram + scenarios from the selected notes, or scenarios again. */
export async function actionBoard(sel: Picked[], uiMode: Mode = "pair", withFlow = true) {
    if (!sel.length) {
        await note(HINT_BOARD, 0, 0, "red");
        return;
    }
    // a flow frame or a scenario frame: new scenarios, in the chosen mode, from the
    // flow stored on it (DRV-21, DRV-22)
    const frame = sel.find((p) => p.meta?.e2eFlow || (p.meta?.e2eScenarios && p.meta?.flow));
    if (frame) {
        const flow = (frame.meta.e2eFlow ?? frame.meta.flow) as Flow;
        if (!flow?.steps?.length) return;
        await drawScenarios(flow, uiMode, frame);
        return;
    }
    // only notes that start with @builder are read; the others are left alone
    const notes = sel.filter((p) => p.text.trim() && !p.meta?.kind && hasMarker(p.text));
    if (!notes.length) {
        await note(HINT_BOARD + "\n\n" + describeSel(sel), sel[0].x, sel[0].y - 220, "red");
        return;
    }
    for (const n of notes) {
        const r = parseFlowText(n.text);
        if (!r.flow.steps.length) {
            await note(
                "Cannot read this note as a flow\n\n" + r.warnings.slice(0, 5).join("\n"),
                n.x,
                n.y - 220,
                "red"
            );
            continue;
        }
        // "scenarios" only: the scenarios go under the note itself, with no flow drawing
        const box = withFlow ? await drawFlow(r.flow, n) : n;
        if (box) await drawScenarios(r.flow, r.mode ?? uiMode, box);
    }
}

const HINT_FLOW =
    "Select a sticky note that starts with @builder, then press the button again\n\n" +
    "Example:\n@builder\n1. Login\n- ok\n- failed -> end\n2. Checkout\n- paid\n- card declined -> end\n\n" +
    "Or select a scenario note (TSS-… / TSN-…) to see the flow of that scenario";

/** What is selected, in a few words, for hint notes (helps when nothing happens). */
function describeSel(sel: Picked[]): string {
    if (!sel.length)
        return "Nothing is selected (select a note first, then press a button in the panel)";
    const p = sel[0];
    const text = p.text.replace(/\s+/g, " ").slice(0, 50);
    return `Selected: ${sel.length} item(s) (${p.type}${text ? ': "' + text + '"' : ""})`;
}

/**
 * Button 2: draw a flow, without scenarios.
 *  - a note with the flow text   -> that flow, under the note
 *  - a scenario note (TSS-/TSN-) -> the flow of just that scenario, next to its frame
 */
export async function actionFlow(sel: Picked[], withTable = true) {
    const items = sel.filter(
        (p) =>
            p.meta?.kind === "scenario" ||
            /^\s*TS[SN]-\d+/.test(p.text) ||
            (p.text.trim() && hasMarker(p.text))
    );
    if (!items.length) {
        await note(
            HINT_FLOW + "\n\n" + describeSel(sel),
            sel[0]?.x ?? 0,
            (sel[0]?.y ?? 0) - 220,
            "red"
        );
        return;
    }
    let last: string | null = null;
    for (const p of items) {
        // a scenario note: its own title (@title TSS-001 · ...) or the older TSS-04821 header
        const parsed = p.meta?.kind === "scenario" || !hasMarker(p.text) ? null : parseFlowText(p.text);
        const scenarioId = parsed?.title.match(/^(TS[SN]-\d+)/)?.[1];
        const isScenario = p.meta?.kind === "scenario" || !!scenarioId || /^\s*TS[SN]-\d+/.test(p.text);
        let sub: Flow | null = null;
        let name: string | undefined;
        let success = true;
        if (isScenario) {
            // exact: the path and flow stored on the note and its frame
            if (Array.isArray(p.meta?.path) && p.frameId) {
                const fr = (await readElements([p.frameId]))[0];
                const flow = fr?.meta?.flow as Flow | undefined;
                if (flow?.steps?.length) {
                    const path = p.meta.path as [number, string | null][];
                    sub = scenarioFlow(flow, path);
                    success = !pathFails(flow, path);
                    name = `E2E Flow · ${p.meta.id ?? "scenario"}`;
                }
            }
            // otherwise read the note's own text in the flow syntax
            if (!sub && parsed && scenarioId && parsed.flow.steps.length) {
                sub = parsed.flow;
                const lastConds = sub.steps[sub.steps.length - 1].conds;
                success = !lastConds.some((c) => c.action === "end");
                name = `E2E Flow · ${scenarioId}`;
            }
            // or the older text ("1. Step → label")
            if (!sub) {
                const t = scenarioFromText(p.text);
                if (t) {
                    sub = t.flow;
                    success = !t.fails;
                    name = `E2E Flow · ${t.id}`;
                }
            }
        } else {
            // the flow syntax (a note that starts with @builder)
            const f = parseFlowText(p.text).flow;
            if (f.steps.length) sub = f;
        }
        if (!sub) {
            await note(
                "Cannot read this note as a flow\n\n" + HINT_FLOW + "\n\n" + describeSel([p]),
                p.x,
                p.y - 220,
                "red"
            );
            continue;
        }
        // a case goes next to its scenario frame (near the note, in view); a flow
        // goes under its note
        let at: [number, number] | undefined;
        if (isScenario) {
            const fr = p.frameId ? (await readElements([p.frameId]))[0] : undefined;
            at = fr ? [fr.x + fr.width + 200, p.y] : [p.x + p.width + 200, p.y];
        }
        const box = await drawFlow(sub, p, { name, success, at });
        if (box) last = box.id;
        // a case note: the flow of that case, and under it the table of that case
        if (box && isScenario && withTable) await drawScenarioTable(sub, name ?? "E2E Flow", box);
    }
    if (last) {
        await flyTo([last], 0.5);
    }
}
