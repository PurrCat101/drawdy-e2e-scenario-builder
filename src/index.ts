import type {
    DriverCommandIssuer,
    DriverModule,
} from "@drawdy/driver-protocol";
import type { DrawdyElementSchema, ModuleStyling } from "@drawdy/driver-protocol";
import type { Flow, Mode } from "./flow";
import { hasMarker, parseFlowText } from "./syntax";
import { casesToTsv, renderCaseTables, type CaseItem } from "./caseTable";
import { renderFlow } from "./render";
import { generate, pick, validate } from "./scenarios";
import { orderCases, renderScenarios } from "./scenarioBoard";
import { ICON_PNG_DATA_URI } from "./iconData";
import { PANEL_HTML } from "./panelHtml";
import { caseFlow, caseFromText, pathFails } from "./caseFlow";
import { templateById, type Template } from "./templates";

/**
 * E2E Scenario Builder.
 *
 * The extension's button (right edge of the board) opens a webview panel: a
 * text box for the flow, a mode switch, live scenario counts, and buttons that
 * draw the flow and its test scenarios on the board.
 */

const BTN = "purrcat101.e2e-scenario-builder:button";

/** The toolbar button takes an svg only, so the logo is embedded as an <image>. */
const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<image href="${ICON_PNG_DATA_URI}" width="24" height="24"/>` +
    "</svg>";

let issue: DriverCommandIssuer;
let generateId: () => string;
let driverId: string;
let requestSeq = 0;
let busy = false;
let busyAt = 0;
/** busy, unless it has been "busy" for so long that something must have hung */
const isBusy = () => busy && Date.now() - busyAt < 30000;
const setBusy = (v: boolean) => {
    busy = v;
    if (v) busyAt = Date.now();
};

const nextRequestId = () => String(requestSeq++);

/** Issue a command and return the error message, or null on success. */
async function run(
    type: string,
    req: unknown
): Promise<{ error: string | null; value: any }> {
    const r: any = await issue({
        type,
        driverId,
        requestId: nextRequestId(),
        req,
    } as any);
    const err = r?.res?.error;
    return {
        error: err ? `${err.type}: ${err.message ?? ""}` : null,
        value: r?.res?.value,
    };
}

/** Put a short status note on the board (errors, hints). */
async function note(text: string, x: number, y: number, fill = "#fde68a") {
    // size the note to its text (about 36 characters per line at 14px)
    const rows = text
        .split("\n")
        .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 36)), 0);
    const height = Math.max(170, 50 + rows * 24);
    await run("command:scene:add-drawdy-elements", {
        elements: [
            {
                type: "shape",
                componentType: "sticky-note",
                drawdyElementId: generateId(),
                x,
                y,
                width: 320,
                height,
                text,
                fontSize: 14,
                fillColor: fill,
            },
        ],
    });
}

/* ------------------------------ webview panel ------------------------------ */

/**
 * The panel: an HTML page in a webview. It has a text box, a mode switch and
 * live scenario counts; it talks to us with postMessage.
 */
/** Drawdy's theme, as CSS variables for the pages in the webviews. */
let styling: ModuleStyling | null = null;
const THEME_MARK = "/*__DRAWDY_STYLING__*/";
function themeCss(): string {
    if (!styling) return "";
    const vars = Object.entries(styling.tokens ?? {})
        .map(([k, v]) => `${k}:${v};`)
        .join("");
    return `:root{${vars}color-scheme:${styling.theme};}`;
}

const NS = "purrcat101.e2e-scenario-builder";
const WV_ID = NS + ":panel";
let wvError = "";

async function openWebview(): Promise<boolean> {
    const r = await run("command:webview:create", {
        webviewDomId: WV_ID,
        htmlContent: PANEL_HTML.replace(THEME_MARK, () => themeCss()),
        keepStateWhenClosed: true,
    });
    wvError = r.error ?? "";
    return !r.error;
}

/** Send a message to the panel's page. */
async function toPanel(message: unknown) {
    await run("command:webview:post-message", { webviewDomId: WV_ID, message });
}

/** Scenario counts and flow problems for a text, for the live preview. */
function previewOf(text: string) {
    const r = parseFlowText(text);
    const flow = r.flow;
    const reading = r.warnings.slice(0, 4);
    if (!flow.steps.length) return { counts: null, steps: 0, issues: reading };
    const gen = generate(flow);
    const ep = pick(gen, "ep").length;
    return {
        steps: flow.steps.length,
        counts: {
            all: gen.list.length,
            ep,
            pair: pick(gen, "pair").length,
            min: pick(gen, "min").length,
        },
        issues: [
            ...reading,
            ...(!flow.steps.some((st) => st.conds.some((c) => c.variant)) && ep > 30
                ? ["INFO: EP is close to All because no condition has [variant] (EP only groups conditions marked variant). Add [variant], or pick the Pair / Each mode."]
                : []),
            ...validate(flow, gen)
                .slice(0, 3)
                .map((i) => (i.lv === "err" ? "ERROR: " : "WARN: ") + i.msg),
        ],
    };
}

/** Where a drawing from typed text goes: under the selected element, else in view. */
async function anchorFor(sel: Picked[]): Promise<Box> {
    if (sel.length) return sel[0];
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    return { x: r.x + 60, y: r.y + 60, width: 0, height: 0 };
}

/** Draw a flow (and its scenarios) from a model. Returns a status line. */
async function drawFromFlow(
    kind: "board" | "flow" | "cases",
    flow: Flow,
    mode: Mode,
    anchor: Box
): Promise<string> {
    if (kind === "cases") {
        // the scenarios only, no flow diagram
        await drawScenarios(flow, mode, anchor);
        return "Cases drawn";
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
    return "Flow and cases drawn";
}

/** Draw from text typed in the panel. Returns a status line for the panel. */
async function drawFromText(
    kind: "board" | "flow" | "cases",
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

async function currentSelectionIds(): Promise<string[]> {
    const cur = await run("command:scene:get-current-selected-drawdy-elements", undefined);
    return cur.value?.drawdyElementIds ?? [];
}

/** Width of a starter note: wide enough that the comment lines do not wrap much. */
const TEMPLATE_W = 520;

/**
 * Drop a starter note (a ready-made `@builder` text) on the board, in free space
 * inside the view, and fly to it. The writer edits it on the board, where there is
 * room, then selects it and presses Flow + Cases.
 */
async function addTemplateNote(t: Template): Promise<string> {
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    // about 61 characters per line at 14px in a note this wide
    const rows = t.text
        .split("\n")
        .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 61)), 0);
    const height = Math.max(170, 50 + rows * 24);
    const [x, y] = findFree(await occupiedRects(), r.x + 60, r.y + 60, TEMPLATE_W, height);
    const id = generateId();
    await run("command:scene:add-drawdy-elements", {
        elements: [
            {
                type: "shape",
                componentType: "sticky-note",
                drawdyElementId: id,
                x,
                y,
                width: TEMPLATE_W,
                height,
                text: t.text,
                fontSize: 14,
                fillColor: "#fef9c3",
            },
        ],
    });
    await run("command:camera:fly-to-elements", {
        drawdyElementIds: [id],
        flyDurationMs: 400,
        zoom: 0.5,
    });
    return `${t.label} note added. Edit it on the board, then select it and press Flow + Cases`;
}

/** Messages from the panel's page. */
async function onPanelMessage(m: any) {
    if (!m || typeof m !== "object") return;
    if (m.type === "preview") {
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
        if (table) [kind, n] = ["table", Number(table.meta.cases ?? 1)];
        else if (frame) [kind, n] = ["frame", Number(frame.meta.count ?? 0)];
        else if (notes.length) [kind, n] = ["cases", notes.length];
        else if (flows.length) [kind, n] = ["flows", flows.length];
        else if (flowFrame) [kind, n] = ["flowframe", 1];
        await toPanel({ type: "target", kind, n });
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
        } else if (m.action === "copy") {
            status = await copyAction(text, uiMode);
            if (!status) return; // the panel reports the result itself
        } else if (text && !usable) {
            status = await drawFromText(
                m.action === "flow" ? "flow" : m.action === "cases" ? "cases" : "board",
                text,
                uiMode
            );
        } else {
            // nothing typed: use what is selected on the board (notes, scenario notes, frames)
            const sel = await readElements(await currentSelectionIds());
            if (!sel.length) {
                status = "Write a flow in the box first, or select a sticky note on the board";
            } else {
                if (m.action === "flow") await actionFlow(sel);
                else await actionBoard(sel, uiMode, m.action !== "cases");
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

/** The toolbar button: open the panel (or say why it cannot be opened). */
async function toggleMenu() {
    if (await openWebview()) return;
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    await note(
        "Could not open the extension window\n\n" + wvError +
            "\n\nCheck that the permissions the extension asks for (dom, scene) are allowed",
        r.x + 40,
        r.y + 40,
        "#fecaca"
    );
}

/* ------------------------------- selection -------------------------------- */

type Box = { x: number; y: number; width: number; height: number };

type Picked = {
    id: string;
    type: string;
    text: string;
    meta: Record<string, any>;
    frameId: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

/** Read elements by id: text, meta, frame and geometry. */
async function readElements(ids: string[]): Promise<Picked[]> {
    if (!ids.length) return [];
    const got = await run("command:scene:get-drawdy-elements", {
        drawdyElementIds: ids,
        properties: ["type", "text", "meta", "frameId", "x", "y", "width", "height"],
    });
    const els: any[] = got.value?.drawdyElements ?? [];
    return els.map((e) => ({
        id: e.id ?? "",
        type: e.type ?? "",
        text: typeof e.text === "string" ? e.text : "",
        meta: e.meta ?? {},
        frameId: e.frameId ?? "",
        x: e.x ?? 0,
        y: e.y ?? 0,
        width: e.width ?? 0,
        height: e.height ?? 0,
    }));
}

/* ----------------------------- free-space search ---------------------------- */

/** Boxes of everything already on the board (elements that have a size). */
async function occupiedRects(): Promise<Box[]> {
    const got = await run("command:scene:get-drawdy-elements", {
        properties: ["x", "y", "width", "height"],
    });
    const els: any[] = got.value?.drawdyElements ?? [];
    return els
        .filter(
            (e) =>
                typeof e.x === "number" &&
                typeof e.y === "number" &&
                e.width > 0 &&
                e.height > 0
        )
        .map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height }));
}

const hits = (a: Box, b: Box) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;

/**
 * Find a free spot for a w x h block, starting at (x, y). While the block would
 * overlap something (with `gap` of breathing room) it moves down to just below
 * that thing, so new results stack under what is already there.
 */
function findFree(
    occupied: Box[],
    x: number,
    y: number,
    w: number,
    h: number,
    gap = 100
): [number, number] {
    let cy = y;
    for (let i = 0; i < 200; i++) {
        const probe = { x: x - gap, y: cy - gap, width: w + gap * 2, height: h + gap * 2 };
        const hit = occupied.filter((o) => hits(probe, o));
        if (!hit.length) return [x, cy];
        cy = Math.max(...hit.map((o) => o.y + o.height)) + gap;
    }
    return [x, cy];
}

/** Size of the frame (first element) a render would produce. */
const frameSize = (els: any[]): { w: number; h: number } => ({
    w: els[0].width,
    h: els[0].height,
});

/* --------------------------------- drawing --------------------------------- */

/** Draw a flow diagram under `anchor`. Returns the frame's box, or null. */
async function drawFlow(
    flow: Flow,
    anchor: Box,
    opts: { name?: string; success?: boolean; at?: [number, number] } = {}
): Promise<(Box & { id: string }) | null> {
    // measure first, then look for room: the diagram goes under the anchor
    // unless something is already there
    const size = frameSize(renderFlow(flow, generateId, [0, 0], opts).elements);
    const [wantX, wantY] = opts.at ?? [anchor.x, anchor.y + anchor.height + 120];
    const origin = findFree(await occupiedRects(), wantX, wantY, size.w, size.h);
    const out = renderFlow(flow, generateId, origin, opts);
    const add = await run("command:scene:add-drawdy-elements", {
        elements: out.elements,
    });
    if (add.error) {
        await note(`Could not draw the flow\n${add.error}`, anchor.x, anchor.y - 200, "#fecaca");
        return null;
    }
    // label the arrows (the create schema has no text field for arrows)
    const upd = await run("command:scene:update-drawdy-elements", {
        updates: out.labels.map((l) => ({
            drawdyElementId: l.arrowId,
            properties: { text: l.text },
        })),
    });
    if (upd.error) {
        await run("command:scene:add-drawdy-elements", {
            elements: out.labels.map((l) => ({
                type: "text",
                drawdyElementId: generateId(),
                frameId: out.frameId,
                x: l.mid[0] - 60,
                y: l.mid[1],
                text: l.text,
                fontSize: 12,
                color: l.color,
                textAlign: "center",
            })),
        });
    }
    const fr: any = out.elements[0];
    return {
        id: out.frameId,
        x: fr.position[0],
        y: fr.position[1],
        width: fr.width,
        height: fr.height,
    };
}

/**
 * Add many elements in small batches, the frame first (a big batch is easier to
 * lose). Returns an error text, or "" when everything was added.
 */
async function addInBatches(elements: DrawdyElementSchema[], size = 30): Promise<string> {
    for (let i = 0; i < elements.length; i += size) {
        const r = await run("command:scene:add-drawdy-elements", { elements: elements.slice(i, i + size) });
        if (r.error) return `${r.error} (batch ${Math.floor(i / size) + 1})`;
    }
    return "";
}

const casePath = (sc: { path: { i: number; c: { id: string } | null }[] }) =>
    sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null]);

/** Title of a case in the tables: id, kind, priority and the choices it takes. */
function caseTitle(id: string, type: string, pri: string | number | undefined, sub: Flow): string {
    const picks = sub.steps.flatMap((s) => s.conds.map((c) => c.label)).join(" · ");
    return `${id} · ${type === "happy" ? "Happy" : "Negative"}${pri ? " · P" + pri : ""}${picks ? "   " + picks : ""}`;
}

/**
 * Button 3: the test sequence of many cases as tables (step, condition, setup,
 * test data, expected result), to check them against the flow. From the text in
 * the panel, from a selected scenario frame (all its cases) or from selected
 * scenario notes.
 */
type Collected = { cases: CaseItem[]; anchor: Box; label: string };

/** The cases to show as tables: the selection on the board wins over the panel's text. */
async function collectCases(text: string, uiMode: Mode): Promise<Collected | string> {
    const sel = await readElements(await currentSelectionIds());
    const cases: CaseItem[] = [];
    let anchor: Box | null = null;
    let label = "Test sequence";
    const fromList = (flow: Flow, mode: Mode) => {
        const gen = generate(flow);
        for (const sc of orderCases(pick(gen, mode))) {
            const sub = caseFlow(flow, casePath(sc));
            cases.push({ title: caseTitle(sc.id, sc.type, sc.pri, sub), flow: sub });
        }
    };
    const frame = sel.find((p) => p.meta?.e2eScenarios && p.meta?.flow);
    const caseNotes = sel.filter((x) => x.meta?.kind === "scenario" && Array.isArray(x.meta.path));
    const flowNotes = sel.filter((x) => !x.meta?.kind && x.text.trim() && hasMarker(x.text));
    const flowFrame = sel.find((x) => x.meta?.e2eFlow);
    if (frame) {
        const mode = (frame.meta.mode as Mode) ?? uiMode;
        fromList(frame.meta.flow as Flow, mode);
        anchor = frame;
        label = `Test sequence · ${mode.toUpperCase()}`;
    } else if (caseNotes.length) {
        for (const p of caseNotes) {
            const fr = p.frameId ? (await readElements([p.frameId]))[0] : undefined;
            const flow = fr?.meta?.flow as Flow | undefined;
            if (!flow?.steps?.length) continue;
            const sub = caseFlow(flow, p.meta.path as [number, string | null][]);
            const pri = p.text.match(/·\s*P(\d)/)?.[1];
            cases.push({ title: caseTitle(String(p.meta.id), String(p.meta.type), pri, sub), flow: sub });
            anchor = anchor ?? p;
        }
    } else if (flowNotes.length) {
        for (const p of flowNotes) {
            const r = parseFlowText(p.text);
            if (!r.flow.steps.length) continue;
            fromList(r.flow, r.mode ?? uiMode);
            anchor = anchor ?? p;
        }
        label = `Test sequence · ${uiMode.toUpperCase()}`;
    } else if (flowFrame) {
        fromList(flowFrame.meta.e2eFlow as Flow, uiMode);
        anchor = flowFrame;
        label = `Test sequence · ${uiMode.toUpperCase()}`;
    } else if (text) {
        const r = parseFlowText(text);
        if (!r.flow.steps.length) return "Cannot read the flow; check the syntax";
        const mode = r.mode ?? uiMode;
        fromList(r.flow, mode);
        anchor = await anchorFor(sel);
        label = `Test sequence · ${mode.toUpperCase()}`;
    }
    if (!cases.length || !anchor)
        return "Write a flow in the box first, or select a scenario frame / case note on the board";
    return { cases, anchor, label };
}

/**
 * Button 3: the test sequence of many cases as tables (step, condition, setup,
 * test data, expected result), to check them against the flow.
 */
async function tableAction(text: string, uiMode: Mode): Promise<string> {
    const got = await collectCases(text, uiMode);
    if (typeof got === "string") return got;
    const { cases, anchor, label } = got;
    const size = renderCaseTables({ cases, name: label, origin: [0, 0], generateId });
    const origin = findFree(await occupiedRects(), anchor.x, anchor.y + anchor.height + 120, size.width, size.height);
    const out = renderCaseTables({ cases, name: `${label} · ${cases.length} cases`, origin, generateId });
    const failed = await addInBatches(out.elements);
    if (failed) return "Could not draw the table: " + failed;
    await run("command:camera:fly-to-elements", { drawdyElementIds: [out.frameId], flyDurationMs: 400, zoom: 0.3 });
    return `Table drawn (${cases.length} cases)`;
}

/**
 * Button 4: the same cases as tab-separated text, sent to the panel, which puts it
 * on the clipboard (a click in the panel is a real user action; the board's embedded
 * pages cannot reliably write to the clipboard).
 */
async function copyAction(text: string, uiMode: Mode): Promise<string> {
    // a table selected on the board (it carries its own text)
    const sel = await readElements(await currentSelectionIds());
    const table = sel.find((p) => typeof p.meta?.tsv === "string");
    if (table) {
        await toPanel({ type: "clip", text: table.meta.tsv, cases: table.meta.cases ?? 1 });
        return "";
    }
    const got = await collectCases(text, uiMode);
    if (typeof got === "string") return got;
    await toPanel({ type: "clip", text: casesToTsv(got.cases), cases: got.cases.length });
    return "";
}

/** The table of one case (step, condition, setup, test data, expected), below its flow drawing. */
async function drawCaseTable(flow: Flow, name: string, below: Box) {
    const one: CaseItem[] = [{ title: name, flow }];
    const size = renderCaseTables({ cases: one, name, origin: [0, 0], generateId });
    const origin = findFree(await occupiedRects(), below.x, below.y + below.height + 100, size.width, size.height);
    const out = renderCaseTables({ cases: one, name: `${name} · table`, origin, generateId });
    const failed = await addInBatches(out.elements);
    if (failed) await note(`Could not draw the case table
${failed}`, below.x, below.y - 200, "#fecaca");
}

/** Generate the scenarios for `flow` below `below` and fly to them. */
async function drawScenarios(flow: Flow, mode: Mode, below: Box) {
    const gen = generate(flow);
    const shown = pick(gen, mode);
    const issues = validate(flow, gen);
    // the four numbers side by side, to compare the modes
    const counts = {
        all: gen.list.length,
        ep: pick(gen, "ep").length,
        pair: pick(gen, "pair").length,
        min: pick(gen, "min").length,
    };
    const base = { flow, mode, shown, gen, issues, counts, generateId };
    const size = frameSize(renderScenarios({ ...base, origin: [0, 0] }).elements);
    const origin = findFree(
        await occupiedRects(),
        below.x,
        below.y + below.height + 120,
        size.w,
        size.h
    );
    const out = renderScenarios({ ...base, origin });
    const add = await run("command:scene:add-drawdy-elements", {
        elements: out.elements,
    });
    if (add.error) {
        await note(`Could not draw scenarios\n${add.error}`, below.x, below.y - 200, "#fecaca");
        return;
    }
    await run("command:camera:fly-to-elements", {
        drawdyElementIds: [out.frameId],
        flyDurationMs: 400,
        zoom: 0.4,
    });
}

const HINT_BOARD =
    "Select a sticky note that starts with @builder (or a flow frame already drawn), then press the button again\n\n" +
    "Example:\n@builder\n1. Login\n- ok\n- failed -> end\n2. Checkout\n- paid\n- card declined -> end\n\n" +
    "Notes that do not start with @builder are not read";

/** Button 1: flow diagram + scenarios from the selected notes, or scenarios again. */
async function actionBoard(sel: Picked[], uiMode: Mode = "ep", withFlow = true) {
    if (!sel.length) {
        await note(HINT_BOARD, 0, 0, "#fecaca");
        return;
    }
    const frame = sel.find((p) => p.meta?.e2eFlow);
    if (frame) {
        // regenerate scenarios from the flow stored on the frame
        const flow = frame.meta.e2eFlow as Flow;
        if (!flow?.steps?.length) return;
        await drawScenarios(flow, uiMode, frame);
        return;
    }
    // only notes that start with @builder are read; the others are left alone
    const notes = sel.filter((p) => p.text.trim() && !p.meta?.kind && hasMarker(p.text));
    if (!notes.length) {
        await note(HINT_BOARD + "\n\n" + describeSel(sel), sel[0].x, sel[0].y - 220, "#fecaca");
        return;
    }
    for (const n of notes) {
        const r = parseFlowText(n.text);
        if (!r.flow.steps.length) {
            await note(
                "Cannot read this note as a flow\n\n" + r.warnings.slice(0, 5).join("\n"),
                n.x,
                n.y - 220,
                "#fecaca"
            );
            continue;
        }
        // "cases" only: the scenarios go under the note itself, with no flow drawing
        const box = withFlow ? await drawFlow(r.flow, n) : n;
        if (box) await drawScenarios(r.flow, r.mode ?? uiMode, box);
    }
}

const HINT_FLOW =
    "Select a sticky note that starts with @builder, then press the button again\n\n" +
    "Example:\n@builder\n1. Login\n- ok\n- failed -> end\n2. Checkout\n- paid\n- card declined -> end\n\n" +
    "Or select a case note (TSS-… / TSN-…) to see the flow of that case";

/** What is selected, in a few words, for hint notes (helps when nothing happens). */
function describeSel(sel: Picked[]): string {
    if (!sel.length)
        return "Nothing is selected (select a note first, then press a button in the panel)";
    const p = sel[0];
    const text = p.text.replace(/\s+/g, " ").slice(0, 50);
    return `Selected: ${sel.length} item(s) (${p.type}${text ? ': "' + text + '"' : ""})`;
}

/**
 * Button 2: draw a flow, without test cases.
 *  - a note with the flow text   -> that flow, under the note
 *  - a scenario note (TSS-/TSN-) -> the flow of just that case, next to its frame
 */
async function actionFlow(sel: Picked[]) {
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
            "#fecaca"
        );
        return;
    }
    let last: string | null = null;
    for (const p of items) {
        // a case note: its own title (@title TSS-001 · ...) or the older TSS-001 header
        const parsed = p.meta?.kind === "scenario" || !hasMarker(p.text) ? null : parseFlowText(p.text);
        const caseId = parsed?.title.match(/^(TS[SN]-\d+)/)?.[1];
        const isCase = p.meta?.kind === "scenario" || !!caseId || /^\s*TS[SN]-\d+/.test(p.text);
        let sub: Flow | null = null;
        let name: string | undefined;
        let success = true;
        if (isCase) {
            // exact: the path and flow stored on the note and its frame
            if (Array.isArray(p.meta?.path) && p.frameId) {
                const fr = (await readElements([p.frameId]))[0];
                const flow = fr?.meta?.flow as Flow | undefined;
                if (flow?.steps?.length) {
                    const path = p.meta.path as [number, string | null][];
                    sub = caseFlow(flow, path);
                    success = !pathFails(flow, path);
                    name = `E2E Flow · ${p.meta.id ?? "case"}`;
                }
            }
            // otherwise read the note's own text in the flow syntax
            if (!sub && parsed && caseId && parsed.flow.steps.length) {
                sub = parsed.flow;
                const lastConds = sub.steps[sub.steps.length - 1].conds;
                success = !lastConds.some((c) => c.action === "end");
                name = `E2E Flow · ${caseId}`;
            }
            // or the older text ("1. Step → label")
            if (!sub) {
                const t = caseFromText(p.text);
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
                "#fecaca"
            );
            continue;
        }
        // a case goes next to its scenario frame (near the note, in view); a flow
        // goes under its note
        let at: [number, number] | undefined;
        if (isCase) {
            const fr = p.frameId ? (await readElements([p.frameId]))[0] : undefined;
            at = fr ? [fr.x + fr.width + 200, p.y] : [p.x + p.width + 200, p.y];
        }
        const box = await drawFlow(sub, p, { name, success, at });
        if (box) last = box.id;
        // a case note: the flow of that case, and under it the table of that case
        if (box && isCase) await drawCaseTable(sub, name ?? "E2E Flow", box);
    }
    if (last) {
        await run("command:camera:fly-to-elements", {
            drawdyElementIds: [last],
            flyDurationMs: 400,
            zoom: 0.5,
        });
    }
}

/* ---------------------------------- module --------------------------------- */

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    generateId = ctx.generateId;
    driverId = ctx.manifest.driverId;
    styling = ctx.styling;

    await run("command:dom:create-action-button", {
        domElementId: BTN,
        svg: ICON,
    });
    await run("subscription:dom:element-clicked", { domElementId: BTN });
    await run("subscription:webview:message", { webviewDomId: WV_ID });
    await run("subscription:dom:theme-changed", undefined);
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (event.type === "subscription:dom:theme-changed") {
        styling = event.body.styling;
        const m = { type: "theme", css: themeCss() };
        await toPanel(m);
        return;
    }
    if (event.type === "subscription:webview:message") {
        if (event.body.webviewDomId === WV_ID) {
            try {
                await onPanelMessage(event.body.message);
            } catch (e) {
                await toPanel({ type: "status", text: "Error: " + String(e), bad: true });
            }
        }
        return;
    }
    if (
        event.type !== "subscription:dom:element-clicked" ||
        event.body.domElementId !== BTN
    ) {
        return;
    }
    if (isBusy()) return;
    setBusy(true);
    try {
        await toggleMenu();
    } catch (e) {
        await note(`Unexpected error\n${String(e)}`, 0, 0, "#fecaca");
    } finally {
        setBusy(false);
    }
};
