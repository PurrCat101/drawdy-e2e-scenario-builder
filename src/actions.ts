import type { Flow, Mode } from "./flow";
import { hasMarker, parseFlowText } from "./syntax";
import { scenariosToTsv, renderScenarioTables, type ScenarioItem } from "./scenarioTable";
import { analyze } from "./analysis";
import { MODE_LABEL, orderScenarios } from "./scenarioBoard";
import { buildDecisionTable, decisionToTsv, MAX_DECISION_SCENARIOS } from "./decisionTable";
import { renderDecisionTables } from "./decisionBoard";
import type { Scenario } from "./scenarios";
import { scenarioFlow, scenarioFromText, pathFails } from "./scenarioFlow";
import type { Template } from "./templates";
import { generateId, note, run } from "./host";
import { fitHeight, textBox } from "./textBox";
import { toPanel } from "./webview";
import {
    anchorFor,
    currentSelectionIds,
    findFree,
    occupiedRects,
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
        await run("command:camera:fly-to-elements", {
            drawdyElementIds: [box.id],
            flyDurationMs: 400,
            zoom: 0.5,
        });
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
 * Drop a starter note (a ready-made `@builder` text) on the board, in free space
 * inside the view, and fly to it. The writer edits it on the board, where there is
 * room, then selects it and presses Flow + Scenarios.
 */
export async function addTemplateNote(t: Template): Promise<string> {
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    // a filled text box, as tall as its text needs (OUT-40, OUT-50)
    const height = fitHeight(t.text, TEMPLATE_W, 14);
    const [x, y] = findFree(await occupiedRects(), r.x + 60, r.y + 60, TEMPLATE_W, height);
    const id = generateId();
    await run("command:scene:add-drawdy-elements", {
        elements: [
            textBox({
                id,
                x,
                y,
                width: TEMPLATE_W,
                height,
                text: t.text,
                fontSize: 14,
                tone: "yellow",
            }),
        ],
    });
    await run("command:camera:fly-to-elements", {
        drawdyElementIds: [id],
        flyDurationMs: 400,
        zoom: 0.5,
    });
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
        const mode = (frame.meta.mode as Mode) ?? uiMode;
        fromList(frame.meta.flow as Flow, mode);
        anchor = frame;
        label = `Test steps · ${mode.toUpperCase()}`;
    } else if (scenarioNotes.length) {
        for (const p of scenarioNotes) {
            const fr = p.frameId ? (await readElements([p.frameId]))[0] : undefined;
            const flow = fr?.meta?.flow as Flow | undefined;
            if (!flow?.steps?.length) continue;
            const sub = scenarioFlow(flow, p.meta.path as [number, string | null][]);
            const pri = p.text.match(/·\s*P(\d)/)?.[1];
            scenarios.push({ title: scenarioTitle(String(p.meta.id), String(p.meta.type), pri, sub), flow: sub });
            anchor = anchor ?? p;
        }
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
    const origin = findFree(await occupiedRects(), anchor.x, anchor.y + anchor.height + 120, size.width, size.height);
    const out = renderScenarioTables({ scenarios, name: `${label} · ${scenarios.length} scenarios`, origin, generateId });
    const failed = await addInBatches(out.elements);
    if (failed) return "Could not draw the table: " + failed;
    await run("command:camera:fly-to-elements", { drawdyElementIds: [out.frameId], flyDurationMs: 400, zoom: 0.3 });
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
        await toPanel({ type: "clip", text: table.meta.tsv, scenarios: tableCount(table.meta) });
        return "";
    }
    const got = await collectScenarios(text, uiMode);
    if (typeof got === "string") return got;
    await toPanel({ type: "clip", text: scenariosToTsv(got.scenarios), scenarios: got.scenarios.length });
    return "";
}

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
    for (const src of got) {
        const dt = buildDecisionTable(src.flow, src.scenarios);
        if (!dt.conditions.length) return "Cannot copy a decision table: the flow has no step with two or more choices";
        parts.push(decisionToTsv(dt));
        n += dt.columns.length;
    }
    await toPanel({ type: "clip", text: parts.join("\n\n"), scenarios: n });
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
    if (frame) return [of(frame.meta.flow as Flow, (frame.meta.mode as Mode) ?? uiMode, frame)];
    if (scenarioNotes.length) {
        // the notes of the first frame: their flow is stored on it
        const first = scenarioNotes[0];
        const fr = first.frameId ? (await readElements([first.frameId]))[0] : undefined;
        const flow = fr?.meta?.flow as Flow | undefined;
        if (!flow?.steps?.length) return "Could not draw: the selected scenario notes no longer know their flow";
        const ids = new Set(scenarioNotes.filter((p) => p.frameId === first.frameId).map((p) => String(p.meta.id)));
        const scenarios = analyze(flow).gen.list.filter((s) => ids.has(s.id));
        if (!scenarios.length) return "Could not draw: the selected scenarios are not in the flow any more";
        return [{ flow, scenarios, mode: (fr?.meta?.mode as Mode) ?? uiMode, anchor: first }];
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
    for (const src of got) {
        const dt = buildDecisionTable(src.flow, src.scenarios);
        if (!dt.conditions.length) return "Cannot draw a decision table: the flow has no step with two or more choices";
        if (dt.columns.length > MAX_DECISION_SCENARIOS)
            return `Could not draw: ${dt.columns.length} scenarios is too many for one decision table (at most ${MAX_DECISION_SCENARIOS}); pick EP, Pair or Each, or press Copy decision table`;
        const name = `Decision table · ${MODE_LABEL[src.mode]}`;
        const size = renderDecisionTables({ table: dt, name, origin: [0, 0], generateId });
        const origin = findFree(await occupiedRects(), src.anchor.x, src.anchor.y + src.anchor.height + 120, size.width, size.height);
        const out = renderDecisionTables({ table: dt, name, origin, generateId });
        const failed = await addInBatches(out.elements);
        if (failed) return "Could not draw the decision table: " + failed;
        drawn += dt.columns.length;
        first = first || out.frameIds[0];
    }
    await run("command:camera:fly-to-elements", { drawdyElementIds: [first], flyDurationMs: 400, zoom: 0.3 });
    return `Decision table drawn (${drawn} scenarios)`;
}

const HINT_BOARD =
    "Select a sticky note that starts with @builder (or a flow frame already drawn), then press the button again\n\n" +
    "Example:\n@builder\n1. Login\n- ok\n- failed -> end\n2. Checkout\n- paid\n- card declined -> end\n\n" +
    "Notes that do not start with @builder are not read";

/** Button 1: flow diagram + scenarios from the selected notes, or scenarios again. */
export async function actionBoard(sel: Picked[], uiMode: Mode = "ep", withFlow = true) {
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
export async function actionFlow(sel: Picked[]) {
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
        // a scenario note: its own title (@title TSS-04821 · ...) or the older TSS-001 header
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
        if (box && isScenario) await drawScenarioTable(sub, name ?? "E2E Flow", box);
    }
    if (last) {
        await run("command:camera:fly-to-elements", {
            drawdyElementIds: [last],
            flyDurationMs: 400,
            zoom: 0.5,
        });
    }
}
