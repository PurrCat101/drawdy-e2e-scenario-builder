import type { Mode } from "./core/flow";
import { hasMarker, parseFlowText } from "./core/syntax";
import { analyze, PREVIEW_BUDGET_MS } from "./core/analysis";
import { coverageLines } from "./core/scenarioText";
import { templateById } from "./core/templates";
import { isBusy, setBusy } from "./host";
import { toPanel } from "./webview";
import { currentSelectionIds, readElements, tableCount } from "./selection";
import {
    actionBoard,
    actionFlow,
    addTemplateNote,
    copyAction,
    copyDecisionAction,
    decisionAction,
    drawFromText,
    tableAction,
} from "./actions";

/** Messages from the panel's page: live counts, what is selected, and the button presses. */

/**
 * The text of the single `@builder` note selected on the board, whose counts the
 * panel is showing; null when the panel shows the counts of its own paste box.
 */
let noteShown: string | null = null;
/** The selected flow note, and its text at the last poll: counted once it holds still. */
let notePending: { id: string; text: string } | null = null;

/** A fresh start (the driver was activated): nothing is being shown or waited for. */
export function resetNoteState() {
    noteShown = null;
    notePending = null;
}

/** Above this many scenarios, the live preview skips the coverage safety net. */
const SAFETY_NET_MAX = 300;

/**
 * Scenario counts and flow problems for a text, for the live preview. Kept light:
 * the search past 1,000 paths gets a short budget, and the coverage safety net runs
 * only for flows of a moderate size (the scenario frame always reports coverage).
 */
function previewOf(text: string) {
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
    return {
        steps: flow.steps.length,
        counts,
        ms: Date.now() - t0,
        issues: [
            ...broken,
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

/** Messages from the panel's page. */
export async function onPanelMessage(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.type === "preview") {
        // a selected flow note wins over the paste box, as it does for the buttons
        if (noteShown !== null) return;
        const p = previewOf(String(m.text ?? ""));
        await toPanel({ type: "counts", ...p });
        return;
    }
    if (m.type === "pull") {
        const sel = await readElements(await currentSelectionIds());
        const texts = sel
            .filter((p) => p.text.trim() && !p.meta?.kind && hasMarker(p.text))
            .map((p) => p.text);
        if (texts.length) await toPanel({ type: "fill", text: texts[0] });
        else
            await toPanel({
                type: "status",
                text: "No selected sticky note starts with @builder",
                bad: true,
            });
        return;
    }
    if (m.type === "template") {
        const t = templateById(m.id);
        if (!t) return;
        if (isBusy()) {
            await toPanel({ type: "status", text: "Busy, please wait" });
            return;
        }
        setBusy(true);
        try {
            await toPanel({ type: "status", text: await addTemplateNote(t) });
        } catch (e) {
            await toPanel({ type: "status", text: "Error: " + String(e), bad: true });
        } finally {
            setBusy(false);
        }
        return;
    }
    if (m.type === "target") {
        // what is selected on the board, so the panel can say what its buttons will use
        if (isBusy()) return;
        const sel = await readElements(await currentSelectionIds());
        const table = sel.find((p) => typeof p.meta?.tsv === "string");
        const frame = sel.find((p) => p.meta?.e2eScenarios && p.meta?.flow);
        const notes = sel.filter((p) => p.meta?.kind === "scenario");
        const flows = sel.filter((p) => !p.meta?.kind && p.text.trim() && hasMarker(p.text));
        const flowFrame = sel.find((p) => p.meta?.e2eFlow);
        let kind = "none";
        let n = 0;
        if (table) [kind, n] = ["table", tableCount(table.meta)];
        else if (frame) [kind, n] = ["frame", Number(frame.meta.count ?? 0)];
        else if (notes.length) [kind, n] = ["scenarios", notes.length];
        else if (flows.length) [kind, n] = ["flows", flows.length];
        else if (flowFrame) [kind, n] = ["flowframe", 1];
        await toPanel({ type: "target", kind, n });
        // counts and flow problems for the note being written on the board
        if (kind === "flows" && flows.length === 1) {
            const { id, text } = flows[0];
            if (text !== noteShown) {
                // a newly selected note is counted at once; a note being typed in is
                // counted when its text holds still for one poll, not on every key
                const fresh = !notePending || notePending.id !== id;
                const still = notePending && notePending.id === id && notePending.text === text;
                notePending = { id, text };
                if (fresh || still) {
                    noteShown = text;
                    await toPanel({ type: "counts", from: "note", ...previewOf(text) });
                } else await toPanel({ type: "counting" });
            }
        } else {
            notePending = null;
            if (noteShown !== null) {
                noteShown = null;
                await toPanel({ type: "recount" });
            }
        }
        return;
    }
    if (m.type !== "action") return;
    if (isBusy()) {
        await toPanel({ type: "status", text: "Busy, please wait" });
        return;
    }
    setBusy(true);
    try {
        const text = String(m.text ?? "").trim();
        const uiMode: Mode = ["ep", "all", "pair", "min"].includes(m.mode) ? m.mode : "ep";
        let status = "";
        // something selected on the board wins over the text left in the panel
        const picked = await readElements(await currentSelectionIds());
        const usable = picked.some(
            (p) =>
                p.meta?.kind === "scenario" ||
                p.meta?.e2eFlow ||
                p.meta?.e2eScenarios ||
                (p.text.trim() && hasMarker(p.text))
        );
        if (m.action === "table") {
            status = await tableAction(text, uiMode);
        } else if (m.action === "decision") {
            status = await decisionAction(text, uiMode);
        } else if (m.action === "copy") {
            status = await copyAction(text, uiMode);
        } else if (m.action === "copydecision") {
            status = await copyDecisionAction(text, uiMode);
            if (!status) return; // the panel reports the result itself
        } else if (text && !usable) {
            status = await drawFromText(
                m.action === "flow" || m.action === "flowonly" ? "flow" : m.action === "scenarios" ? "scenarios" : "board",
                text,
                uiMode
            );
        } else {
            // nothing typed: use what is selected on the board (notes, scenario notes, frames)
            const sel = await readElements(await currentSelectionIds());
            if (!sel.length) {
                status = "Write a flow in the box first, or select a sticky note on the board";
            } else {
                // DRV-60: "flowonly" is the Flow + Scenarios button of a scenario note: the flow, no test steps
                if (m.action === "flow" || m.action === "flowonly") await actionFlow(sel, m.action === "flow");
                else await actionBoard(sel, uiMode, m.action !== "scenarios");
                status = "Done";
            }
        }
        await toPanel({ type: "status", text: status, bad: /^(Could not|Write a flow|Select|Cannot)/.test(status) });
    } catch (e) {
        await toPanel({ type: "status", text: "Error: " + String(e), bad: true });
    } finally {
        setBusy(false);
    }
}
