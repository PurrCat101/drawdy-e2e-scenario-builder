// Regression tests of the driver (src/index.ts) against a small fake Drawdy host,
// and of the panel page (editor/panel.html) against a stub DOM. No browser needed.
//
// The fake host keeps a scene in memory, answers the commands the driver uses, and
// records what the driver posts to the panel. It cannot check how things LOOK (see
// the notes in README: that needs a real browser), but it checks what the buttons
// do for each kind of selection, which is where the bugs have been.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as driver from "../src/index.ts";
import { parseFlowText } from "../src/syntax.ts";
import { fitHeight } from "../src/textBox.ts";
import { TEMPLATES } from "../src/templates.ts";

const NS = "purrcat101.e2e-scenario-builder";
const PANEL = NS + ":panel";

const FLOW = `@builder
1. Login
   given: stack is up
   data: user a
   then: dialog opens
   - ok [P1]
     data: good password
     then: token stored
   - bad -> end [P2]
     then: error shown
2. Pay
   - paid [P1]
     then: receipt
`;

type El = Record<string, any>;

async function makeHost() {
    const scene = new Map<string, El>();
    let selection: string[] = [];
    const toPanel: any[] = [];
    let n = 0;
    const idOf = (e: El) => e.drawdyElementId ?? e.id;
    const flat = (e: El) => ({
        ...e,
        id: idOf(e),
        x: e.x ?? e.position?.[0],
        y: e.y ?? e.position?.[1],
    });

    const issueCommand = async (r: any) => {
        const ok = (value?: any) => ({ res: { value } });
        const q = r.req ?? {};
        switch (r.type) {
            case "command:scene:get-current-selected-drawdy-elements":
                return ok({ drawdyElementIds: selection });
            case "command:scene:get-drawdy-elements": {
                const list = q.drawdyElementIds
                    ? q.drawdyElementIds.map((id: string) => scene.get(id)).filter(Boolean)
                    : [...scene.values()];
                return ok({ drawdyElements: list.map(flat) });
            }
            case "command:scene:add-drawdy-elements":
                for (const e of q.elements) scene.set(idOf(e), e);
                return ok();
            case "command:camera:get-viewport-rect":
                return ok({ rect: { x: 0, y: 0, width: 1400, height: 900 } });
            case "command:webview:post-message":
                toPanel.push(q.message);
                return ok();
            default:
                return ok({ created: true });
        }
    };

    await driver.activate({
        issueCommand,
        manifest: { driverId: NS } as any,
        styling: { theme: "light", tokens: {} } as any,
        generateId: () => "g" + ++n,
    } as any);

    const panel = async (message: any) => {
        await driver.onEvent({
            type: "subscription:webview:message",
            body: { webviewDomId: PANEL, message },
        } as any);
    };
    const action = (a: string, text = "", mode = "ep") =>
        panel({ type: "action", action: a, text, mode });
    const select = (...ids: string[]) => {
        selection = ids;
    };
    const find = (pred: (e: El) => boolean) => [...scene.values()].filter(pred);
    const frames = () => find((e) => e.type === "frame");
    const tables = () => find((e) => e.type === "component");
    const lastTarget = async () => {
        toPanel.length = 0;
        await panel({ type: "target" });
        return toPanel.find((m) => m.type === "target");
    };
    const lastClip = () => [...toPanel].reverse().find((m) => m.type === "clip");
    // put an element on the board as if the user had drawn it
    const add = (e: El) => void scene.set(idOf(e), e);
    return { scene, toPanel, panel, action, select, find, frames, tables, lastTarget, lastClip, idOf, add };
}

/** a host with the flow and its scenario notes already drawn (Flow + Scenarios) */
async function drawn(mode = "ep") {
    const h = await makeHost();
    await h.action("board", FLOW, mode);
    return h;
}
// a starter note: a text box that starts with @builder and is not one of our scenario notes
const isStarter = (e: any) => e.type === "shape" && !e.meta?.kind && /^@builder/.test(e.text ?? "");
const scenarioNotes = (h: Awaited<ReturnType<typeof makeHost>>) =>
    h.find((e) => e.meta?.kind === "scenario");

test("DRV-02 DRV-03: the toolbar button and the panel messages are wired", async () => {
    const h = await makeHost();
    await h.panel({ type: "preview", text: FLOW });
    const counts = h.toPanel.find((m) => m.type === "counts");
    assert.equal(counts.steps, 2);
    assert.equal(counts.counts.all, 2); // login ok > pay, and login bad
});

test("DRV-21: Flow + Scenarios draws a flow frame and a scenario frame", async () => {
    const h = await drawn();
    const names = h.frames().map((f) => f.name);
    assert.ok(names.some((n) => /^E2E Flow/.test(n)));
    assert.ok(names.some((n) => /^Scenarios/.test(n)));
    assert.equal(scenarioNotes(h).length, 2);
});

test("DRV-22 DRV-23: Scenarios draws only the scenarios, Flow only the flow", async () => {
    const a = await makeHost();
    await a.action("scenarios", FLOW);
    assert.deepEqual(a.frames().map((f) => f.name.split(" ")[0]), ["Scenarios"]);
    const b = await makeHost();
    await b.action("flow", FLOW);
    assert.deepEqual(b.frames().map((f) => f.name.split(" ")[0]), ["E2E"]);
    assert.equal(scenarioNotes(b).length, 0);
});

test("OUT-22 OUT-23: scenario notes: happy first, then negative; each is a flow in the syntax", async () => {
    const h = await drawn();
    const notes = scenarioNotes(h);
    const kinds = notes.map((e) => e.meta.type);
    assert.equal(kinds.indexOf("neg"), kinds.lastIndexOf("happy") + 1);
    for (const e of notes) {
        assert.match(e.text, /^@builder\n@title TS[SN]-\d+ · /);
        assert.ok(e.text.includes("then:") || e.text.includes("- "));
    }
});

test("UI-30: the panel reports what is selected", async () => {
    const h = await drawn();
    assert.equal((await h.lastTarget()).kind, "none");
    h.select(h.idOf(scenarioNotes(h)[0]));
    assert.deepEqual(await h.lastTarget(), { type: "target", kind: "scenarios", n: 1 });
    h.select(h.idOf(h.frames().find((f) => /^Scenarios/.test(f.name))!));
    const t = await h.lastTarget();
    assert.equal(t.kind, "frame");
    assert.equal(t.n, 2);
});

test("DRV-24: Table: a selected scenario note gives one table, the text gives all of them", async () => {
    const h = await drawn();
    h.select(h.idOf(scenarioNotes(h)[0]));
    await h.action("table", FLOW);
    const one = h.tables().at(-1)!;
    assert.equal(one.meta.scenarios, 1);

    const g = await drawn();
    await g.action("table", FLOW); // nothing selected: the whole mode
    assert.equal(g.tables().at(-1)!.meta.scenarios, 2);
});

test("UI-06: the buttons are in three groups under the headings Draw, Tables and Export", () => {
    const html = readFileSync(new URL("../editor/panel.html", import.meta.url), "utf8");
    const block = html.slice(html.indexOf('<div class="acts">'), html.indexOf('<div class="status"'));
    // headings and buttons, in the order the user sees them
    const order = [...block.matchAll(/<div class="grp wide">([^<]+)<\/div>|<button id="([a-z]+)"/g)].map((m) => m[1] ?? m[2]);
    assert.deepEqual(order, ["Draw", "flow", "scenarios", "board", "Tables", "table", "decision", "Export", "copy", "copydecision"]);
    const label = (id: string) => block.match(new RegExp(`<button id="${id}"[^>]*>([^<]*)</button>`))![1];
    assert.deepEqual(
        ["flow", "scenarios", "board", "table", "decision", "copy", "copydecision"].map(label),
        ["Flow", "Scenarios", "Flow + Scenarios", "Test steps", "Decision table", "Copy to clipboard", "Copy decision table"]
    );
    // Flow + Scenarios is the primary button; the three tables and export buttons are full width
    assert.match(block, /<button id="board" class="primary wide"/);
    for (const id of ["table", "decision", "copy", "copydecision"]) assert.match(block, new RegExp(`<button id="${id}" class="wide"`));
});

test("OUT-30: the Test steps frame is named after the button, with the mode when it holds many scenarios", async () => {
    const h = await drawn();
    h.select(h.idOf(scenarioNotes(h)[0]));
    await h.action("table", FLOW);
    const names = h.frames().filter((f) => f.meta?.e2eScenarioTable).map((f) => f.name);
    assert.equal(names.length, 1);
    assert.ok(names[0].startsWith("Test steps"), names[0]);
    const g = await drawn();
    await g.action("table", FLOW, "ep");
    const many = g.frames().filter((f) => f.meta?.e2eScenarioTable).map((f) => f.name);
    assert.match(many[0], /^Test steps · EP · 2 scenarios$/);
});

test("OUT-01 OUT-30 OUT-31: a table is placed in board coordinates and its columns include their padding", async () => {
    const h = await drawn();
    await h.action("table", FLOW);
    const frame = h.frames().find((f) => f.meta?.e2eScenarioTable)!;
    const comp = h.tables().at(-1)!;
    // a component is positioned on the board, not inside its frame
    assert.equal(comp.x, frame.position[0] + 40);
    assert.equal(comp.y, frame.position[1] + 50);
    const html: string = comp.schema.child.srcDoc;
    assert.match(html, /box-sizing:border-box/);
    // the frame holds the table with room around it
    assert.ok(frame.width > comp.width && frame.height > comp.height);
});

test("DRV-20: a selection wins over the text left in the panel", async () => {
    const h = await drawn();
    h.select(h.idOf(scenarioNotes(h)[0]));
    await h.action("copy", "s1 > s2 > s3 > s4");
    const clip = h.lastClip();
    assert.equal(clip.scenarios, 1);
    assert.match(clip.text, /^Scenario\t#\tStep\tCondition\tSetup\tTest data\tExpected result\n/);
    assert.ok(!clip.text.includes("s4"));
});

test("DRV-25: Copy to clipboard: nothing selected copies every scenario of the mode; a table copies itself", async () => {
    const h = await drawn();
    await h.action("copy", FLOW);
    assert.equal(h.lastClip().scenarios, 2);
    // the cell with two lines is quoted for a spreadsheet
    assert.match(h.lastClip().text, /"user a\ngood password"/);

    await h.action("table", FLOW);
    const comp = h.tables().at(-1)!;
    h.select(h.idOf(comp));
    assert.equal((await h.lastTarget()).kind, "table");
    await h.action("copy", FLOW);
    assert.equal(h.lastClip().text, comp.meta.tsv);
});

test("DRV-27: Copy to clipboard: without a flow or a selection it says so and copies nothing", async () => {
    const h = await makeHost();
    await h.action("copy", "");
    assert.equal(h.lastClip(), undefined);
    const status = [...h.toPanel].reverse().find((m) => m.type === "status");
    assert.ok(status.bad);
});

test("DRV-23 OUT-24: Flow on a scenario note draws that scenario's flow and its table, and not the other scenarios", async () => {
    const h = await drawn();
    const before = h.frames().length;
    h.select(h.idOf(scenarioNotes(h)[0]));
    await h.action("flow", "");
    const added = h.frames().slice(before);
    assert.equal(added.length, 2);
    assert.ok(added.some((f) => /^E2E Flow · TS[SN]-/.test(f.name)));
    assert.ok(added.some((f) => f.meta?.e2eScenarioTable));
});

test("UI-31: Scenarios and Flow + Scenarios on a scenario note do not draw anything (the panel disables them)", async () => {
    const h = await drawn();
    h.select(h.idOf(scenarioNotes(h)[0]));
    const before = h.scene.size;
    await h.action("scenarios", "");
    // only a hint note, no scenarios or flow
    assert.ok(h.frames().every((f) => !(f.meta?.e2eScenarios && f.name.includes("(2)"))));
    assert.ok(h.scene.size - before <= 1);
});

test("CALC-30: mode: the same flow in All gives more scenarios than in EP", async () => {
    const flow = "@builder\n1. a\n   - x [variant]\n   - y [variant]\n2. b\n   - p [variant]\n   - q [variant]\n";
    const ep = await makeHost();
    await ep.action("scenarios", flow, "ep");
    const all = await makeHost();
    await all.action("scenarios", flow, "all");
    assert.ok(scenarioNotes(all).length > scenarioNotes(ep).length);
    assert.equal(scenarioNotes(all).length, 4);
});

test("OUT-22: no limit on the number of scenario notes", async () => {
    // 8 steps of 2 choices: 256 paths in All
    let flow = "@builder\n";
    for (let i = 1; i <= 8; i++) flow += `${i}. s${i}\n   - a${i}\n   - b${i}\n`;
    const h = await makeHost();
    await h.action("scenarios", flow, "all");
    assert.ok(scenarioNotes(h).length >= 200);
});

test("DRV-30 OUT-40: a starter note lands on the board as an @builder note that Flow + Scenarios can read", async () => {
    const h = await makeHost();
    await h.panel({ type: "template", id: "shop" });
    const notes = h.find(isStarter);
    assert.equal(notes.length, 1);
    assert.match(notes[0].text, /^@builder\n/);
    assert.ok(notes[0].width >= 400 && notes[0].height >= 170);
    const status = [...h.toPanel].reverse().find((m) => m.type === "status");
    assert.match(status.text, /Starter note added/);
    assert.ok(!status.bad);
    // select it and press Flow + Scenarios: no text in the box, the note is used
    h.select(h.idOf(notes[0]));
    await h.action("board", "");
    assert.ok(h.frames().some((f) => /^Scenarios/.test(f.name)));
    assert.ok(scenarioNotes(h).length >= 2);
});

test("OUT-50: every note is a filled text box sized to its text, never a sticky note", async () => {
    const h = await makeHost();
    await h.panel({ type: "template", id: "shop" });
    await h.action("board", FLOW, "ep");
    await h.action("board", ""); // nothing selected: a hint note
    const all = h.find(() => true);
    assert.ok(!all.some((e) => e.componentType === "sticky-note"), "no sticky notes");
    const boxes = all.filter(
        (e) => e.type === "shape" && e.componentType === "rect" && e.textAlign === "left" && typeof e.text === "string"
    );
    // header + scenarios + starter + hint
    assert.ok(boxes.length >= 4, "text boxes: " + boxes.length);
    for (const b of boxes) {
        assert.ok(b.fillColor && b.strokeColor && b.fillColor !== b.strokeColor, "has a fill and a darker border");
        assert.equal(b.textColor, "#000000", "the text is black, not the colour of the fill or border");
        assert.ok(b.height >= fitHeight(b.text, b.width, b.fontSize), "the text fits: " + b.text.slice(0, 30));
    }
    const starter = boxes.find(isStarter);
    assert.equal(starter.height, fitHeight(starter.text, starter.width, starter.fontSize), "the starter note is no taller than its text");
});

test("SYN-01 DRV-20: a flow is read from any element that holds the text: sticky note, text box or plain text", async () => {
    const shapes: Record<string, El> = {
        "sticky note": { type: "shape", componentType: "sticky-note", x: 0, y: 0, width: 300, height: 200, fillColor: "blue" },
        "text box (a rectangle with text)": { type: "shape", componentType: "rect", x: 0, y: 0, width: 300, height: 200, fillColor: "#fef9c3", strokeColor: "#854d0e" },
        "plain text": { type: "text", x: 0, y: 0, fontSize: 16, color: "#000000" },
    };
    for (const [what, base] of Object.entries(shapes)) {
        const h = await makeHost();
        h.add({ ...base, drawdyElementId: "user1", text: FLOW });
        h.select("user1");
        await h.action("board", "");
        assert.ok(h.frames().some((f) => /^E2E Flow/.test(f.name)), what + ": the flow is drawn");
        assert.ok(h.frames().some((f) => /^Scenarios/.test(f.name)), what + ": the scenarios are drawn");
        assert.equal(scenarioNotes(h).length, 2, what);
    }
    // a note without the marker is left alone, whatever it is
    const h = await makeHost();
    h.add({ type: "shape", componentType: "rect", x: 0, y: 0, width: 300, height: 100, drawdyElementId: "plain", text: "1. Login\n- ok" });
    h.select("plain");
    await h.action("board", "");
    assert.equal(h.frames().length, 0);
});

test("OUT-41: a second starter note goes into free space, not on top of the first", async () => {
    const h = await makeHost();
    await h.panel({ type: "template", id: "shop" });
    await h.panel({ type: "template", id: "shop" });
    const [a, b] = h.find(isStarter);
    const overlap =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    assert.ok(!overlap);
});

test("DRV-30: an unknown starter id adds nothing", async () => {
    const h = await makeHost();
    await h.panel({ type: "template", id: "nope" });
    assert.equal(h.find(isStarter).length, 0);
});

test("UI-40 DRV-42 DRV-43: the panel counts the flow note selected on the board, and goes back to the paste box after", async () => {
    const h = await makeHost();
    await h.panel({ type: "template", id: "shop" });
    const note = h.find(isStarter)[0];
    h.select(h.idOf(note));
    h.toPanel.length = 0;
    await h.panel({ type: "target" });
    const counts = h.toPanel.find((m) => m.type === "counts");
    assert.equal(counts?.from, "note");
    assert.ok(counts.counts.all >= 2 && counts.steps === 10);
    // while the note is selected, the paste box's own preview does not replace it
    h.toPanel.length = 0;
    await h.panel({ type: "preview", text: "1. a\n- b" });
    assert.equal(h.toPanel.filter((m) => m.type === "counts").length, 0);
    // the same note again: nothing new is sent
    await h.panel({ type: "target" });
    assert.equal(h.toPanel.filter((m) => m.type === "counts").length, 0);
    // unselected: the panel is told to count its paste box again
    h.select();
    await h.panel({ type: "target" });
    assert.ok(h.toPanel.some((m) => m.type === "recount"));
    h.toPanel.length = 0;
    await h.panel({ type: "preview", text: "1. a\n- b" });
    assert.equal(h.toPanel.find((m) => m.type === "counts")?.from, undefined);
});

test("DRV-42 DRV-44 CALC-80: a flow the panel already counted is not worked out again when a button is pressed", async () => {
    const { clearCache, cacheStats } = await import("../src/analysis.ts");
    const h = await makeHost();
    await h.panel({ type: "template", id: "shop" });
    const note = h.find(isStarter)[0];
    h.select(h.idOf(note));
    clearCache();
    await h.panel({ type: "target" }); // the panel's poll: counts the note
    assert.deepEqual(cacheStats(), { hits: 0, misses: 1, size: 1 });
    await h.panel({ type: "target" }); // polled again, same text: nothing to do
    await h.action("board", ""); // Flow + Scenarios on the selected note
    await h.action("table", "");
    const s = cacheStats();
    assert.equal(s.misses, 1, "worked out once");
    assert.ok(s.hits >= 2, "then answered from memory: " + s.hits);
    // an edited note is a different flow, counted once the text holds still: the poll
    // right after a change only says "counting", the next one counts
    note.text += "\n4. Done\n- ok";
    h.toPanel.length = 0;
    await h.panel({ type: "target" });
    assert.ok(h.toPanel.some((m) => m.type === "counting"));
    assert.equal(cacheStats().misses, 1, "not counted while it may still be changing");
    await h.panel({ type: "target" });
    assert.equal(cacheStats().misses, 2);
    const counts = [...h.toPanel].reverse().find((m) => m.type === "counts");
    assert.equal(counts.steps, 11);
    assert.equal(typeof counts.ms, "number");
});

test("CALC-32 CALC-82: EP's 'stands for' marks stay on EP: another mode drawn after it has none", async () => {
    const { analyze } = await import("../src/analysis.ts");
    const flow = parseFlowText("1. Pick\n- shirt [variant]\n- shoes [variant]\n2. Pay\n- paid\n- declined -> end").flow;
    const a = analyze(flow);
    assert.ok(a.pick("ep").some((sc) => sc.covers && sc.covers.length));
    for (const m of ["all", "pair", "min"] as const) assert.ok(a.pick(m).every((sc) => !sc.covers || !sc.covers.length), m);
});

test("CALC-81: a quick preview of a huge flow is worked out again in full for a button", async () => {
    const { analyze, clearCache, cacheStats } = await import("../src/analysis.ts");
    const text = Array.from({ length: 10 }, (_, i) => `${i + 1}. S${i}\n- a${i}\n- b${i}\n- c${i}\n- d${i}`).join("\n");
    const flow = parseFlowText(text).flow;
    clearCache();
    const quick = analyze(flow, 0); // no time at all for the search past 1,000 paths
    assert.equal(quick.complete, false);
    const full = analyze(flow);
    assert.equal(full.complete, true);
    assert.equal(cacheStats().misses, 2, "the quick answer was not reused for the full one");
    assert.equal(analyze(flow, 0), full, "a full answer serves a quick request too");
    assert.ok(full.counts().all > quick.counts().all);
});

test("DRV-22: Scenarios on a selected scenario frame draws a new frame in the chosen mode", async () => {
    const h = await makeHost();
    await h.action("board", FLOW);
    const fr = h.frames().find((f) => f.meta?.e2eScenarios)!;
    const before = h.frames().length;
    h.select(h.idOf(fr));
    h.toPanel.length = 0;
    await h.action("scenarios", "", "all");
    const made = h.frames().filter((f) => f.meta?.e2eScenarios);
    assert.equal(h.frames().length, before + 1);
    assert.equal(made[made.length - 1].meta.mode, "all");
    assert.ok(!h.find((e) => typeof e.text === "string" && /^Select a sticky note/.test(e.text)).length, "no hint note");
});

/* ------------------------------- decision table ------------------------------- */

const decisionFrames = (h: Awaited<ReturnType<typeof makeHost>>) => h.frames().filter((f) => f.meta?.e2eDecision);
const lastStatus = (h: Awaited<ReturnType<typeof makeHost>>) => [...h.toPanel].reverse().find((m) => m.type === "status");

test("DRV-57 OUT-60: Decision table from the paste box draws frames of text boxes and says how many scenarios", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "pair");
    const frames = decisionFrames(h);
    assert.equal(frames.length, 1);
    assert.match(frames[0].name, /^Decision table · Pairwise \(2-wise\) · 10 scenarios$/);
    assert.equal(lastStatus(h).text, "Decision table drawn (10 scenarios)");
    assert.ok(!lastStatus(h).bad);
    assert.equal(h.find((e) => e.type === "shape" && /^TS[SN]-\d{3}$/.test(e.text ?? "")).length, 10, "a box with the ID for each column");
    assert.equal(h.find((e) => e.type === "shape" && e.text === "TSS-001").length, 1);
    assert.equal(h.tables().length, 0, "no embedded page");
    assert.equal(h.find((e) => e.componentType === "sticky-note").length, 0);
});

test("DRV-57: with a scenario frame selected, the decision table is of all its scenarios, in the mode it was drawn in", async () => {
    const h = await makeHost();
    await h.action("board", FLOW, "min");
    const frame = h.frames().find((f) => /^Scenarios/.test(f.name))!;
    h.select(h.idOf(frame));
    await h.action("decision", "", "all"); // the panel's switch says All: the frame's own mode wins
    const dt = decisionFrames(h);
    assert.equal(dt.length, 1);
    assert.match(dt[0].name, /^Decision table · Each-Choice \(1-wise\) · /);
    assert.equal(dt[0].meta.scenarios, frame.meta.count);
});

test("DRV-57: with scenario notes selected, only those scenarios are columns", async () => {
    const h = await makeHost();
    await h.action("board", FLOW, "all");
    const notes = scenarioNotes(h);
    assert.ok(notes.length >= 2);
    h.select(h.idOf(notes[0]));
    await h.action("decision", "", "ep");
    const dt = decisionFrames(h);
    assert.equal(dt.length, 1);
    assert.equal(dt[0].meta.scenarios, 1);
    // the column is named by the ID the note shows (CALC-57), though the panel's switch says EP
    const heads = h.find((e) => e.type === "shape" && /^TS[SN]-\d{3}$/.test(e.text ?? ""));
    assert.deepEqual(heads.map((e) => e.text), [String(notes[0].meta.id)]);
});

test("DRV-57: a @builder note selected gives a table for its flow, and two notes give two tables", async () => {
    const h = await makeHost();
    h.add({ type: "shape", componentType: "rect", x: 0, y: 0, width: 300, height: 100, drawdyElementId: "n1", text: FLOW });
    h.add({ type: "shape", componentType: "rect", x: 400, y: 0, width: 300, height: 100, drawdyElementId: "n2", text: FLOW });
    h.select("n1");
    await h.action("decision", "", "all");
    assert.equal(decisionFrames(h).length, 1);
    h.select("n1", "n2");
    await h.action("decision", "", "all");
    assert.equal(decisionFrames(h).length, 3, "one more for each of the two notes");
});

test("DRV-57: a flow with no step that decides draws nothing and says why", async () => {
    const h = await makeHost();
    await h.action("decision", "@builder\n1. A\n   - only\n2. B\n   - only too\n", "ep");
    assert.equal(decisionFrames(h).length, 0);
    const s = lastStatus(h);
    assert.match(s.text, /^Cannot draw a decision table: the flow has no step with two or more choices/);
    assert.ok(s.bad);
});

test("DRV-57: more than 60 scenarios draws nothing and names the smaller modes", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "all"); // 113 scenarios
    assert.equal(decisionFrames(h).length, 0);
    const s = lastStatus(h);
    assert.match(s.text, /^Could not draw: \d+ scenarios is too many for one decision table \(at most 60\); pick EP, Pair or Each, or press Copy decision table$/);
    assert.ok(s.bad);
});

test("DRV-58: Copy decision table copies the text of the table the Decision table button draws, and draws nothing", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "pair");
    const drawn = decisionFrames(h)[0].meta.tsv;
    const before = decisionFrames(h).length;
    await h.action("copydecision", TEMPLATES[0].text, "pair");
    const clip = h.lastClip();
    assert.equal(clip.text, drawn);
    assert.equal(clip.scenarios, 10);
    assert.equal(decisionFrames(h).length, before, "nothing is drawn");
});

test("DRV-58: Copy decision table has no limit of 60: every scenario is one more column in one row", async () => {
    const h = await makeHost();
    await h.action("copydecision", TEMPLATES[0].text, "all"); // more than 60 scenarios, which Decision table refuses
    const clip = h.lastClip();
    assert.ok(clip.scenarios > 60, `${clip.scenarios} scenarios`);
    const rows = clip.text.split("\n").map((r: string) => r.split("\t"));
    // the head row is the scenario IDs (OUT-64), each column with its own
    assert.deepEqual(rows[0].slice(0, 3), ["Condition", "Combination", "TSS-001"]);
    assert.equal(rows[0].length, 2 + clip.scenarios);
    assert.ok(rows.every((r: string[]) => r.length === rows[0].length), "every row is as wide as the head");
    assert.equal(rows[1][1], "Group");
    assert.equal(new Set(rows[0].slice(2)).size, clip.scenarios, "each column has its own ID");
});

test("DRV-58: Copy decision table with a scenario frame selected uses that frame's scenarios", async () => {
    const h = await makeHost();
    await h.action("scenarios", TEMPLATES[0].text, "pair");
    const frame = h.find((e) => e.type === "frame" && e.meta?.e2eScenarios)[0];
    h.select(h.idOf(frame));
    await h.action("copydecision", "", "ep");
    assert.equal(h.lastClip().scenarios, frame.meta.count);
});

test("DRV-58: Copy decision table says why when the flow has no step that decides, and copies nothing", async () => {
    const h = await makeHost();
    await h.action("copydecision", "@builder\n1. A\n   - only\n2. B\n   - only too\n", "ep");
    const s = lastStatus(h);
    assert.match(s.text, /^Cannot copy a decision table: the flow has no step with two or more choices/);
    assert.ok(s.bad);
});

test("DRV-57: nothing selected and no text gives the usual hint", async () => {
    const h = await makeHost();
    await h.action("decision", "", "ep");
    assert.equal(decisionFrames(h).length, 0);
    assert.ok(lastStatus(h).bad);
});

const headsOf = (h: Awaited<ReturnType<typeof makeHost>>, frame: El) =>
    h.find((e) => e.meta?.kind === "scenario" && e.frameId === h.idOf(frame));
const stepTexts = (h: Awaited<ReturnType<typeof makeHost>>) =>
    h.find((e) => e.meta?.kind === "step").map((e) => String(e.text));

test("DRV-59 OUT-66: a column head traces back to its own flow, even when the note was edited and another table was drawn", async () => {
    const h = await makeHost();
    h.add({ type: "shape", componentType: "rect", x: 0, y: 0, width: 300, height: 100, drawdyElementId: "n1", text: FLOW });
    h.add({ type: "shape", componentType: "rect", x: 900, y: 0, width: 300, height: 100, drawdyElementId: "n2", text: FLOW });
    h.select("n1");
    await h.action("decision", "", "all");
    // the second note is edited (Pay becomes Ship) before its own table is drawn
    h.scene.get("n2")!.text = FLOW.replace("2. Pay", "2. Ship").replace("- paid", "- shipped");
    h.select("n2");
    await h.action("decision", "", "all");
    // the first note is edited too, after its table was drawn
    h.scene.get("n1")!.text = "@builder\n1. Other\n   - x\n   - y\n";
    const [first, second] = decisionFrames(h);
    assert.notDeepEqual(first.meta.flow, second.meta.flow, "each table has its own snapshot");

    // a head of the first table: its flow is the first one, not the edited notes
    const head = headsOf(h, first)[0];
    h.select(h.idOf(head));
    await h.action("flow", "");
    assert.ok(stepTexts(h).some((t) => /Pay/.test(t)), "the step of the first table's flow");
    assert.ok(!stepTexts(h).some((t) => /Ship|Other/.test(t)), "not the steps of the edited notes");
    assert.ok(h.frames().some((f) => f.name === `E2E Flow · ${head.meta.id}`));
    assert.ok(h.frames().some((f) => f.meta?.e2eScenarioTable), "and the test steps of that scenario");

    // a head of the second table: its own flow
    const before = stepTexts(h).length;
    h.select(h.idOf(headsOf(h, second)[0]));
    await h.action("flow", "");
    assert.ok(stepTexts(h).slice(before).some((t) => /Ship/.test(t)));
});

test("DRV-59 OUT-66: the mode of the table is kept, so the same ID in two modes is two scenarios", async () => {
    const h = await makeHost();
    const flow = TEMPLATES[0].text;
    await h.action("decision", flow, "pair");
    await h.action("decision", flow, "min");
    const [pair, min] = decisionFrames(h);
    assert.equal(pair.meta.mode, "pair");
    assert.equal(min.meta.mode, "min");
    // the third Happy scenario is not the same path in Pairwise and in Each
    const third = (f: El) => headsOf(h, f).find((e) => e.meta.id === "TSS-003");
    assert.notDeepEqual(third(pair)!.meta.path, third(min)!.meta.path);
    // each head gives its own scenario's test steps, whatever the panel's switch says
    h.select(h.idOf(third(min)!));
    await h.action("table", "", "ep");
    const tables = h.frames().filter((f) => f.meta?.e2eScenarioTable);
    assert.equal(tables.length, 1);
    assert.equal(tables[0].meta.scenarios, 1);
    h.select(h.idOf(third(pair)!));
    await h.action("table", "", "ep");
    const both = h.frames().filter((f) => f.meta?.e2eScenarioTable);
    assert.notEqual(both[0].meta.tsv, both[1].meta.tsv, "another path, other test steps");
});

test("DRV-59: selected column heads draw a decision table of just those scenarios, with the same IDs", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "pair");
    const frame = decisionFrames(h)[0];
    const two = headsOf(h, frame).slice(1, 3);
    h.select(...two.map((e) => h.idOf(e)));
    await h.action("decision", "", "all");
    const [, sub] = decisionFrames(h);
    assert.equal(sub.meta.scenarios, 2);
    assert.equal(sub.meta.mode, "pair", "the mode of the table the heads are in");
    assert.deepEqual(headsOf(h, sub).map((e) => e.meta.id), two.map((e) => e.meta.id));
});

test("DRV-59: the panel counts selected column heads as scenarios", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "pair");
    h.select(...headsOf(h, decisionFrames(h)[0]).slice(0, 3).map((e) => h.idOf(e)));
    const target = await h.lastTarget();
    assert.equal(target.kind, "scenarios");
    assert.equal(target.n, 3);
});

test("DRV-59: a head whose frame does not keep its flow (a table of an older version) draws nothing and says so", async () => {
    const h = await makeHost();
    h.add({ type: "frame", drawdyElementId: "old", name: "Decision table · All Paths · 1 scenarios", position: [0, 0], width: 400, height: 200, meta: { e2eDecision: true, scenarios: 1, tsv: "x" } });
    h.add({
        type: "shape", componentType: "rect", drawdyElementId: "oldhead", frameId: "old", x: 10, y: 10, width: 100, height: 30,
        text: "TSS-001", meta: { kind: "scenario", id: "TSS-001", type: "happy", path: [[0, "x"]] },
    });
    h.select("oldhead");
    const before = h.scene.size;
    await h.action("table", "");
    assert.equal(h.scene.size, before, "nothing drawn");
    const s = lastStatus(h);
    assert.match(s.text, /no longer know their flow.*draw it again/);
});

test("DRV-25 OUT-64 UI-30: a selected decision table is a table: the panel says so and Copy to clipboard copies its text", async () => {
    const h = await makeHost();
    await h.action("decision", TEMPLATES[0].text, "pair");
    const frame = decisionFrames(h)[0];
    h.select(h.idOf(frame));
    const target = await h.lastTarget();
    assert.equal(target.kind, "table");
    assert.equal(target.n, 10);
    await h.action("copy", "");
    const clip = h.lastClip();
    assert.equal(clip.scenarios, 10);
    assert.match(clip.text, /^Condition\tCombination\tTSS-001\t/);
    assert.equal(clip.text, frame.meta.tsv);
});

test("OUT-60 OUT-01: the decision table is placed below what is selected, not on top of it", async () => {
    const h = await makeHost();
    h.add({ type: "shape", componentType: "rect", x: 100, y: 100, width: 300, height: 100, drawdyElementId: "n1", text: FLOW });
    h.select("n1");
    await h.action("decision", "", "all");
    const f = decisionFrames(h)[0];
    assert.ok(f.position[1] >= 100 + 100, "the table starts below the note");
});

/* ------------------------------ the panel page ----------------------------- */

function loadPanel() {
    const html = readFileSync(new URL("../editor/panel.html", import.meta.url), "utf8");
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()![1];
    const els: Record<string, any> = {};
    const mk = (id: string) =>
        (els[id] ??= {
            id,
            disabled: false,
            title: "",
            textContent: "",
            className: "",
            value: "",
            hidden: false,
            attrs: {} as Record<string, string>,
            children: [] as any[],
            setAttribute(k: string, v: string) {
                this.attrs[k] = v;
            },
            getAttribute(k: string) {
                return this.attrs[k] ?? null;
            },
            classList: { toggle() {} },
            addEventListener() {},
            style: {},
            appendChild(c: any) {
                this.children.push(c);
            },
            focus() {},
            select() {},
        });
    const sent: any[] = [];
    let onMessage: (m: any) => void = () => {};
    const g: any = globalThis;
    const saved = { document: g.document, api: g.acquireDrawdyApi, si: g.setInterval, st: g.setTimeout };
    g.document = {
        getElementById: mk,
        querySelectorAll: () => [],
        createElement: (tag: string) => ({
            tag,
            textContent: "",
            className: "",
            style: {},
            children: [] as any[],
            appendChild(c: any) {
                this.children.push(c);
            },
        }),
        createTextNode: () => ({}),
        execCommand: () => true,
    };
    g.acquireDrawdyApi = () => ({
        postMessage: (m: any) => sent.push(m),
        onMessage: (f: any) => (onMessage = f),
    });
    g.setInterval = () => 0;
    g.setTimeout = () => 0;
    new Function(script)();
    const restore = () => {
        g.document = saved.document;
        g.acquireDrawdyApi = saved.api;
        g.setInterval = saved.si;
        g.setTimeout = saved.st;
    };
    return { els, sent, send: (m: any) => onMessage(m), restore };
}

test("UI-31: panel: which buttons are on for each selection", () => {
    const p = loadPanel();
    try {
        const row = (kind: string) => {
            p.send({ type: "target", kind, n: 1 });
            return ["flow", "scenarios", "board", "table", "decision", "copy", "copydecision"]
                .map((id) => (p.els[id].disabled ? "-" : id))
                .filter((x) => x !== "-")
                .join(",");
        };
        assert.equal(row("none"), ""); // nothing to use yet
        assert.equal(row("scenarios"), "flow,table,decision,copy,copydecision");
        assert.equal(row("frame"), "scenarios,table,decision,copy,copydecision");
        assert.equal(row("flows"), "flow,scenarios,board,table,decision,copy,copydecision");
        assert.equal(row("flowframe"), "scenarios,board,table,decision,copy,copydecision");
        assert.equal(row("table"), "copy");
        // with a flow typed and nothing selected, everything works
        p.els.t.value = "@builder\n1. a\n- b";
        p.send({ type: "counts", counts: { all: 5, ep: 3, pair: 2, min: 2 }, steps: 1, issues: [] });
        assert.equal(row("none"), "flow,scenarios,board,table,decision,copy,copydecision");
    } finally {
        p.restore();
    }
});

test("UI-32 UI-33: panel: labels follow the selection and say what will be used", () => {
    const p = loadPanel();
    try {
        p.els.t.value = "x";
        p.send({ type: "counts", counts: { all: 231, ep: 28, pair: 17, min: 11 }, steps: 3, issues: [] });
        p.send({ type: "target", kind: "none", n: 0 });
        assert.equal(p.els.table.textContent, "Test steps · EP · 28 scenarios");
        assert.equal(p.els.decision.textContent, "Decision table · EP · 28 scenarios");
        assert.equal(p.els.copydecision.textContent, "Copy decision table · EP · 28 scenarios");
        assert.equal(p.els.copy.textContent, "Copy to clipboard · EP · 28 scenarios");
        assert.equal(p.els.flow.textContent, "Flow");
        p.send({ type: "target", kind: "scenarios", n: 2 });
        assert.equal(p.els.table.textContent, "Test steps · 2 scenarios");
        assert.equal(p.els.decision.textContent, "Decision table · 2 scenarios");
        assert.equal(p.els.flow.textContent, "Flow + Test steps");
        p.send({ type: "target", kind: "frame", n: 28 });
        assert.equal(p.els.copy.textContent, "Copy to clipboard · 28 scenarios");
        assert.equal(p.els.decision.textContent, "Decision table · 28 scenarios");
        p.send({ type: "target", kind: "scenarios", n: 1 });
        assert.equal(p.els.table.textContent, "Test steps · 1 scenario");
        assert.equal(p.els.decision.textContent, "Decision table · 1 scenario");
        assert.equal(p.els.copydecision.textContent, "Copy decision table · 1 scenario");
        p.send({ type: "target", kind: "table", n: 1 });
        assert.equal(p.els.copy.textContent, "Copy to clipboard · selected table");
    } finally {
        p.restore();
    }
});

test("UI-45: issues are one line each, coloured by kind, and past two they fold away", () => {
    const p = loadPanel();
    try {
        p.send({
            type: "counts",
            counts: { all: 9, ep: 5, pair: 4, min: 3 },
            steps: 3,
            issues: ["ERROR: EP MISSING choices: \"x\"", "TIP: run them all", "WARN: Step 2: duplicate", "Line 4: Unknown option"],
        });
        const kids = p.els.issues.children;
        assert.deepEqual(kids.slice(0, 2).map((d: any) => d.className), ["iss err", "iss info"]);
        const more = kids[2];
        assert.equal(more.tag, "details");
        assert.equal(more.children[0].textContent, "2 more");
        assert.deepEqual(more.children.slice(1).map((d: any) => d.className), ["iss warn", "iss warn"]);
    } finally {
        p.restore();
    }
});

test("UI-04: a big mode suggests only modes with fewer scenarios", () => {
    const p = loadPanel();
    try {
        p.send({ type: "counts", counts: { all: 1624, ep: 1201, pair: 64, min: 9 }, steps: 12, issues: [] });
        assert.equal(p.els.plan.textContent, "Mode EP: 1201 scenarios (a lot; the board may get slow. Each has 9, Pair has 64)");
    } finally {
        p.restore();
    }
});

test("UI-04: panel: a lot of scenarios gets a warning, and the mode count follows the switch", () => {
    const p = loadPanel();
    try {
        p.send({ type: "counts", counts: { all: 231, ep: 28, pair: 17, min: 11 }, steps: 3, issues: [] });
        assert.equal(p.els.plan.textContent, "Mode EP: 28 scenarios");
        assert.equal(p.els.plan.className, "plan");
    } finally {
        p.restore();
    }
});

test("UI-12 UI-13: panel: the starter buttons ask the driver for a template; a pulled note opens the paste box", () => {
    const p = loadPanel();
    try {
        for (const id of ["shop"]) p.els["tpl-" + id].onclick();
        assert.deepEqual(
            p.sent.filter((m) => m.type === "template").map((m) => m.id),
            ["shop"]
        );
        p.send({ type: "fill", text: "@builder\n1. a\n- b" });
        assert.equal(p.els.paste.open, true);
        assert.equal(p.els.t.value, "@builder\n1. a\n- b");
    } finally {
        p.restore();
    }
});

test("UI-41: panel: counts dim while the note is being typed in, and come back with the next count", () => {
    const p = loadPanel();
    try {
        p.send({ type: "counting" });
        assert.equal(p.els.counts.style.opacity, "0.5");
        p.send({ type: "counts", from: "note", counts: { all: 9, ep: 5, pair: 4, min: 3 }, steps: 3, issues: [], ms: 1300 });
        assert.equal(p.els.counts.style.opacity, "");
    } finally {
        p.restore();
    }
});

test("UI-40 UI-44: panel: counts from a note are labelled, and a recount asks for the paste box's counts", () => {
    const p = loadPanel();
    try {
        p.send({ type: "counts", from: "note", counts: { all: 9, ep: 5, pair: 4, min: 3 }, steps: 3, issues: [] });
        assert.equal(p.els.counts.title, "Counts of the selected flow note");
        p.els.t.value = "1. a\n- b";
        p.send({ type: "recount" });
        assert.deepEqual(p.sent[p.sent.length - 1], { type: "preview", text: "1. a\n- b" });
        p.send({ type: "counts", counts: { all: 1, ep: 1, pair: 1, min: 1 }, steps: 1, issues: [] });
        assert.equal(p.els.counts.title, "Counts of the text in the paste box");
    } finally {
        p.restore();
    }
});

test("UI-14: panel: the clipboard message copies and reports", () => {
    const p = loadPanel();
    try {
        p.send({ type: "clip", text: "a\tb", scenarios: 2 });
        assert.equal(p.els.clip.value, "a\tb");
        assert.match(p.els.status.textContent, /Copied 2 scenario\(s\)/);
    } finally {
        p.restore();
    }
});

test("UI-20: one word for one thing: the user sees \"scenario\", never \"case\"", async () => {
    const word = /\b(test )?cases?\b/i;
    // the files people read ("letter case" is something else)
    for (const f of ["../README.md", "../src/templates.ts"]) {
        const text = readFileSync(new URL(f, import.meta.url), "utf8").replace(/letter case/g, "");
        const hit = text.split("\n").find((l) => word.test(l) && !/^## /.test(l));
        assert.ok(!hit, f + ": " + hit);
    }
    // what the driver writes on the board and says to the panel in a full run
    const h = await makeHost();
    await h.action("board", FLOW);
    await h.action("table", FLOW);
    await h.action("copy", FLOW);
    await h.panel({ type: "template", id: "shop" });
    const said = h.toPanel.filter((m) => m.type === "status").map((m) => m.text);
    const names = h.frames().map((f) => f.name);
    const texts = h.find((e) => typeof e.text === "string" && e.text).map((e) => e.text);
    for (const t of [...said, ...names]) assert.ok(!word.test(t), t);
    assert.ok(texts.length > 0);
    // the first column of the copied table
    assert.match(h.lastClip().text.split("\n")[0], /^Scenario\t/);
    // the panel page itself: labels, hints and messages (the identifiers are internal)
    const html = readFileSync(new URL("../editor/panel.html", import.meta.url), "utf8");
    // labels, tooltips and placeholders always count; a quoted string in the script
    // counts when it is a sentence (single words there are identifiers like 'scenarios')
    const shown = [...html.matchAll(/>([^<>]+)<\/(?:button|span|div|summary|p)>|(?:title|placeholder)="([^"]*)"|'([^']*)'/g)]
        .flatMap((m) => (m[3] !== undefined ? (/\s/.test(m[3]) && !/^\s*\+|\+\s*$/.test(m[3]) ? [m[3]] : []) : [m[1] ?? m[2] ?? ""]));
    for (const t of shown) assert.ok(!word.test(t), t);
});

test("UI-21: no Thai text is left in what the user sees", () => {
    const thai = /[฀-๿]/;
    for (const f of ["../editor/panel.html", "../src/index.ts", "../src/syntax.ts", "../src/scenarioBoard.ts", "../src/render.ts", "../README.md"])
        assert.ok(!thai.test(readFileSync(new URL(f, import.meta.url), "utf8")), f);
});

// ---- the data the driver keeps on the board (DRV-50 to DRV-54) and the busy flag (DRV-28) ----

test("DRV-28: a second press while an action runs answers Busy and draws nothing; the next press works", async () => {
    const h = await makeHost();
    // both presses start before the first one can finish
    await Promise.all([h.action("board", FLOW), h.action("board", FLOW)]);
    const busy = h.toPanel.filter((m) => m.type === "status" && m.text === "Busy, please wait");
    assert.equal(busy.length, 1);
    assert.ok(!busy[0].bad, "Busy is not an error");
    // drawn once: one flow frame and one scenario frame, not two of each
    assert.equal(h.frames().length, 2);
    // the flag is released afterwards
    await h.action("board", FLOW);
    assert.equal(h.frames().length, 4);
});

test("DRV-50: a flow frame holds the flow in meta.e2eFlow; a scenario's own flow frame holds e2eCase and no flow", async () => {
    const h = await drawn();
    const flowFrame = h.frames().find((f) => f.meta?.e2eFlow)!;
    assert.deepEqual(flowFrame.meta.e2eFlow, parseFlowText(FLOW).flow);
    assert.equal(flowFrame.meta.e2eCase, undefined);

    const before = h.frames().length;
    h.select(h.idOf(scenarioNotes(h)[0]));
    await h.action("flow", "");
    const own = h.frames().slice(before).find((f) => /^E2E Flow · TS[SN]-/.test(f.name))!;
    assert.equal(own.meta.e2eCase, true);
    assert.equal(own.meta.e2eFlow, undefined);
});

test("DRV-51: the flow diagram's parts are tagged: steps, red end boxes, and the green end", async () => {
    const h = await drawn();
    const flow = parseFlowText(FLOW).flow;
    const parts = h.find((e) => e.meta?.kind);
    const steps = parts.filter((e) => e.meta.kind === "step");
    assert.deepEqual(steps.map((e) => e.meta.stepId).sort(), flow.steps.map((s) => s.id).sort());
    // one red end box for the one choice that ends the flow ("bad")
    const ends = parts.filter((e) => e.meta.kind === "end");
    const endCond = flow.steps.flatMap((s) => s.conds).filter((c) => c.action === "end");
    assert.equal(endCond.length, 1);
    assert.deepEqual(ends.map((e) => e.meta.condId), endCond.map((c) => c.id));
    assert.equal(parts.filter((e) => e.meta.kind === "end-ok").length, 1);
});

test("DRV-52: a scenario frame holds e2eScenarios, the mode, how many scenarios it shows, and the flow", async () => {
    const h = await drawn("all");
    const frame = h.frames().find((f) => f.meta?.e2eScenarios)!;
    assert.equal(frame.meta.e2eScenarios, true);
    assert.equal(frame.meta.mode, "all");
    assert.equal(frame.meta.count, scenarioNotes(h).length);
    assert.deepEqual(frame.meta.flow, parseFlowText(FLOW).flow);
});

test("DRV-53: a scenario note holds its id, its type, and its path as [step index, choice id | null]", async () => {
    const h = await drawn();
    const flow = parseFlowText(FLOW).flow;
    const condIds = new Set(flow.steps.flatMap((s) => s.conds.map((c) => c.id)));
    const notes = scenarioNotes(h);
    assert.ok(notes.length >= 2);
    for (const n of notes) {
        assert.equal(n.meta.kind, "scenario");
        assert.match(n.meta.id, /^TS[SN]-\d+$/);
        assert.equal(n.meta.id.startsWith("TSS") ? "happy" : "neg", n.meta.type);
        assert.ok(Array.isArray(n.meta.path) && n.meta.path.length > 0);
        for (const [i, c] of n.meta.path) {
            assert.ok(Number.isInteger(i) && i >= 0 && i < flow.steps.length);
            assert.ok(c === null || condIds.has(c), `unknown choice id ${c}`);
        }
    }
});

test("DRV-54: a table holds e2eScenarioTable, how many scenarios it has, and the copy text", async () => {
    const h = await drawn();
    await h.action("table", FLOW);
    const t = h.tables().at(-1)!;
    assert.equal(t.meta.e2eScenarioTable, true);
    assert.equal(t.meta.scenarios, 2);
    assert.equal(typeof t.meta.tsv, "string");
    assert.ok(t.meta.tsv.length > 0);
    // Copy to clipboard copies exactly that text
    h.select(h.idOf(t));
    await h.action("copy", "");
    assert.equal(h.lastClip().text, t.meta.tsv);
});

test("DRV-54: a table from an earlier version (`cases`, or neither) is still read: scenarios ?? cases ?? 1", async () => {
    for (const [meta, want] of [
        [{ e2eScenarioTable: true, cases: 3, tsv: "a\tb" }, 3],
        [{ e2eScenarioTable: true, scenarios: 4, cases: 3, tsv: "a\tb" }, 4],
        [{ e2eScenarioTable: true, tsv: "a\tb" }, 1],
    ] as const) {
        const h = await makeHost();
        h.add({ id: "old", type: "component", meta });
        h.select("old");
        const t = await h.lastTarget();
        assert.equal(t.kind, "table");
        assert.equal(t.n, want, JSON.stringify(meta));
    }
});
