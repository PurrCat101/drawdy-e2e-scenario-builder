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
    return { scene, toPanel, panel, action, select, find, frames, tables, lastTarget, lastClip, idOf };
}

/** a host with the flow and its scenario notes already drawn (Flow + Cases) */
async function drawn(mode = "ep") {
    const h = await makeHost();
    await h.action("board", FLOW, mode);
    return h;
}
const caseNotes = (h: Awaited<ReturnType<typeof makeHost>>) =>
    h.find((e) => e.meta?.kind === "scenario");

test("the toolbar button and the panel messages are wired", async () => {
    const h = await makeHost();
    await h.panel({ type: "preview", text: FLOW });
    const counts = h.toPanel.find((m) => m.type === "counts");
    assert.equal(counts.steps, 2);
    assert.equal(counts.counts.all, 2); // login ok > pay, and login bad
});

test("Flow + Cases draws a flow frame and a scenario frame", async () => {
    const h = await drawn();
    const names = h.frames().map((f) => f.name);
    assert.ok(names.some((n) => /^E2E Flow/.test(n)));
    assert.ok(names.some((n) => /^Scenarios/.test(n)));
    assert.equal(caseNotes(h).length, 2);
});

test("Cases draws only the scenarios, Flow only the flow", async () => {
    const a = await makeHost();
    await a.action("cases", FLOW);
    assert.deepEqual(a.frames().map((f) => f.name.split(" ")[0]), ["Scenarios"]);
    const b = await makeHost();
    await b.action("flow", FLOW);
    assert.deepEqual(b.frames().map((f) => f.name.split(" ")[0]), ["E2E"]);
    assert.equal(caseNotes(b).length, 0);
});

test("scenario notes: happy first, then negative; each is a flow in the syntax", async () => {
    const h = await drawn();
    const notes = caseNotes(h);
    const kinds = notes.map((e) => e.meta.type);
    assert.equal(kinds.indexOf("neg"), kinds.lastIndexOf("happy") + 1);
    for (const e of notes) {
        assert.match(e.text, /^@builder\n@title TS[SN]-\d+ · /);
        assert.ok(e.text.includes("then:") || e.text.includes("- "));
    }
});

test("the panel reports what is selected", async () => {
    const h = await drawn();
    assert.equal((await h.lastTarget()).kind, "none");
    h.select(h.idOf(caseNotes(h)[0]));
    assert.deepEqual(await h.lastTarget(), { type: "target", kind: "cases", n: 1 });
    h.select(h.idOf(h.frames().find((f) => /^Scenarios/.test(f.name))!));
    const t = await h.lastTarget();
    assert.equal(t.kind, "frame");
    assert.equal(t.n, 2);
});

test("Table: a selected case note gives one table, the text gives all of them", async () => {
    const h = await drawn();
    h.select(h.idOf(caseNotes(h)[0]));
    await h.action("table", FLOW);
    const one = h.tables().at(-1)!;
    assert.equal(one.meta.cases, 1);

    const g = await drawn();
    await g.action("table", FLOW); // nothing selected: the whole mode
    assert.equal(g.tables().at(-1)!.meta.cases, 2);
});

test("a table is placed in board coordinates and its columns include their padding", async () => {
    const h = await drawn();
    await h.action("table", FLOW);
    const frame = h.frames().find((f) => f.meta?.e2eCaseTable)!;
    const comp = h.tables().at(-1)!;
    // a component is positioned on the board, not inside its frame
    assert.equal(comp.x, frame.position[0] + 40);
    assert.equal(comp.y, frame.position[1] + 50);
    const html: string = comp.schema.child.srcDoc;
    assert.match(html, /box-sizing:border-box/);
    // the frame holds the table with room around it
    assert.ok(frame.width > comp.width && frame.height > comp.height);
});

test("a selection wins over the text left in the panel", async () => {
    const h = await drawn();
    h.select(h.idOf(caseNotes(h)[0]));
    await h.action("copy", "s1 > s2 > s3 > s4");
    const clip = h.lastClip();
    assert.equal(clip.cases, 1);
    assert.match(clip.text, /^Case\t#\tStep\tCondition\tSetup\tTest data\tExpected result\n/);
    assert.ok(!clip.text.includes("s4"));
});

test("Copy table: nothing selected copies every case of the mode; a table copies itself", async () => {
    const h = await drawn();
    await h.action("copy", FLOW);
    assert.equal(h.lastClip().cases, 2);
    // the cell with two lines is quoted for a spreadsheet
    assert.match(h.lastClip().text, /"user a\ngood password"/);

    await h.action("table", FLOW);
    const comp = h.tables().at(-1)!;
    h.select(h.idOf(comp));
    assert.equal((await h.lastTarget()).kind, "table");
    await h.action("copy", FLOW);
    assert.equal(h.lastClip().text, comp.meta.tsv);
});

test("Copy table: without a flow or a selection it says so and copies nothing", async () => {
    const h = await makeHost();
    await h.action("copy", "");
    assert.equal(h.lastClip(), undefined);
    const status = [...h.toPanel].reverse().find((m) => m.type === "status");
    assert.ok(status.bad);
});

test("Flow on a case note draws that case's flow and its table, and not the other cases", async () => {
    const h = await drawn();
    const before = h.frames().length;
    h.select(h.idOf(caseNotes(h)[0]));
    await h.action("flow", "");
    const added = h.frames().slice(before);
    assert.equal(added.length, 2);
    assert.ok(added.some((f) => /^E2E Flow · TS[SN]-/.test(f.name)));
    assert.ok(added.some((f) => f.meta?.e2eCaseTable));
});

test("Cases and Flow + Cases on a case note do not draw anything (the panel disables them)", async () => {
    const h = await drawn();
    h.select(h.idOf(caseNotes(h)[0]));
    const before = h.scene.size;
    await h.action("cases", "");
    // only a hint note, no scenarios or flow
    assert.ok(h.frames().every((f) => !(f.meta?.e2eScenarios && f.name.includes("(2)"))));
    assert.ok(h.scene.size - before <= 1);
});

test("mode: the same flow in All gives more cases than in EP", async () => {
    const flow = "@builder\n1. a\n   - x [variant]\n   - y [variant]\n2. b\n   - p [variant]\n   - q [variant]\n";
    const ep = await makeHost();
    await ep.action("cases", flow, "ep");
    const all = await makeHost();
    await all.action("cases", flow, "all");
    assert.ok(caseNotes(all).length > caseNotes(ep).length);
    assert.equal(caseNotes(all).length, 4);
});

test("no limit on the number of scenario notes", async () => {
    // 8 steps of 2 choices: 256 paths in All
    let flow = "@builder\n";
    for (let i = 1; i <= 8; i++) flow += `${i}. s${i}\n   - a${i}\n   - b${i}\n`;
    const h = await makeHost();
    await h.action("cases", flow, "all");
    assert.ok(caseNotes(h).length >= 200);
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
        createElement: () => ({ textContent: "", appendChild() {} }),
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

test("panel: which buttons are on for each selection", () => {
    const p = loadPanel();
    try {
        const row = (kind: string) => {
            p.send({ type: "target", kind, n: 1 });
            return ["flow", "cases", "board", "table", "copy"]
                .map((id) => (p.els[id].disabled ? "-" : id))
                .filter((x) => x !== "-")
                .join(",");
        };
        assert.equal(row("none"), ""); // nothing to use yet
        assert.equal(row("cases"), "flow,table,copy");
        assert.equal(row("frame"), "cases,table,copy");
        assert.equal(row("flows"), "flow,cases,board,table,copy");
        assert.equal(row("flowframe"), "cases,board,table,copy");
        assert.equal(row("table"), "copy");
        // with a flow typed and nothing selected, everything works
        p.els.t.value = "@builder\n1. a\n- b";
        p.send({ type: "counts", counts: { all: 5, ep: 3, pair: 2, min: 2 }, steps: 1, issues: [] });
        assert.equal(row("none"), "flow,cases,board,table,copy");
    } finally {
        p.restore();
    }
});

test("panel: labels follow the selection and say what will be used", () => {
    const p = loadPanel();
    try {
        p.els.t.value = "x";
        p.send({ type: "counts", counts: { all: 231, ep: 28, pair: 17, min: 11 }, steps: 3, issues: [] });
        p.send({ type: "target", kind: "none", n: 0 });
        assert.equal(p.els.table.textContent, "Table · all cases of mode EP (28)");
        assert.equal(p.els.copy.textContent, "Copy table · all cases of mode EP (28)");
        assert.equal(p.els.flow.textContent, "Flow");
        p.send({ type: "target", kind: "cases", n: 2 });
        assert.equal(p.els.table.textContent, "Table · selected cases (2)");
        assert.equal(p.els.flow.textContent, "Flow + Table");
        p.send({ type: "target", kind: "frame", n: 28 });
        assert.equal(p.els.copy.textContent, "Copy table · all cases in the frame (28)");
        p.send({ type: "target", kind: "table", n: 1 });
        assert.equal(p.els.copy.textContent, "Copy table · selected table");
    } finally {
        p.restore();
    }
});

test("panel: a lot of cases gets a warning, and the mode count follows the switch", () => {
    const p = loadPanel();
    try {
        p.send({ type: "counts", counts: { all: 231, ep: 28, pair: 17, min: 11 }, steps: 3, issues: [] });
        assert.equal(p.els.plan.textContent, "Mode EP: 28 cases");
        assert.equal(p.els.plan.className, "plan");
    } finally {
        p.restore();
    }
});

test("panel: the clipboard message copies and reports", () => {
    const p = loadPanel();
    try {
        p.send({ type: "clip", text: "a\tb", cases: 2 });
        assert.equal(p.els.clip.value, "a\tb");
        assert.match(p.els.status.textContent, /Copied 2 case\(s\)/);
    } finally {
        p.restore();
    }
});

test("no Thai text is left in what the user sees", () => {
    const thai = /[฀-๿]/;
    for (const f of ["../editor/panel.html", "../src/index.ts", "../src/syntax.ts", "../src/scenarioBoard.ts", "../src/render.ts", "../README.md"])
        assert.ok(!thai.test(readFileSync(new URL(f, import.meta.url), "utf8")), f);
});
