// A snapshot of what the whole pipeline produces for a few fixed flows, so that moving
// code around (the split into src/core and the Drawdy side) can be shown to change nothing:
// scenarios and IDs per mode, counts, coverage lines, the copied text (test steps and
// decision table), and every element the board drawing would send to Drawdy.
//
// The snapshot is test/golden/pipeline.json. It is written only on purpose:
//   GOLDEN_UPDATE=1 npm test   (then read the diff of the JSON like any other change)
// Without that variable a difference fails the test.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parseFlowText } from "../src/core/syntax.ts";
import { analyze } from "../src/core/analysis.ts";
import { scenarioFlow } from "../src/core/scenarioFlow.ts";
import { renderScenarioTable, renderScenarioTables } from "../src/scenarioTable.ts";
import { flowStepsToTsv, scenariosToTsv } from "../src/core/testSteps.ts";
import { buildDecisionTable, decisionToTsv } from "../src/core/decisionTable.ts";
import { renderDecisionTables } from "../src/decisionBoard.ts";
import { renderScenarios } from "../src/scenarioBoard.ts";
import { coverageLines, requirementLines } from "../src/core/scenarioText.ts";
import { renderFlow } from "../src/render.ts";
import { TEMPLATES } from "../src/core/templates.ts";
import { modeTip } from "../src/core/scenarios.ts";
import type { Mode } from "../src/core/flow.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "golden", "pipeline.json");

const LOOPS = `@builder
1. Login
   - ok
   - bad -> end
     then: 401 BAD_LOGIN
2. Pick
   - a
   - b
   - more -> loop to step 2 max 2 [distinct]
3. Note
   - one choice only
4. Pay
   - paid
   - declined -> end
     then: 402 DECLINED
   - no funds -> end
`;

const QUANTITY = `@builder
1. Enter quantity (allowed 1 to 15)
- -1 items -> end [variant]
  expect: Error: quantity must be 1 to 15
- 0 items -> end
  expect: Error: quantity must be 1 to 15
- 1 item
- 5 items [variant]
- 8 items [variant]
- 14 items [variant]
- 15 items
- 16 items -> end
  expect: Error: quantity must be 1 to 15
- 99 items -> end [variant]
  expect: Error: quantity must be 1 to 15
2. Choose shipping
- Standard
- Express
`;

const FLOWS: Record<string, string> = {
    loops: LOOPS,
    quantity: QUANTITY,
    ...Object.fromEntries(TEMPLATES.map((t) => [`template-${t.id}`, t.text])),
};

const MODES: Mode[] = ["all", "ep", "pair", "min"];

/** a short fingerprint: the snapshot stays small, and a difference names the part that moved */
const fp = (x: unknown) => createHash("sha1").update(JSON.stringify(x) ?? "null").digest("hex").slice(0, 12);

function snapshot() {
    const out: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(FLOWS)) {
        const parsed = parseFlowText(text);
        const flow = parsed.flow;
        const a = analyze(flow);
        const counts = a.counts();
        const perMode: Record<string, unknown> = {};
        for (const mode of MODES) {
            const list = a.pick(mode);
            let n = 0;
            const id = () => "e" + ++n;
            const items = list.map((sc) => ({
                title: sc.id,
                flow: scenarioFlow(
                    flow,
                    sc.path.map((v) => [v.i, v.c ? v.c.id : null] as [number, string | null])
                ),
            }));
            const dt = buildDecisionTable(flow, list);
            perMode[mode] = {
                count: list.length,
                ids: list.map((sc) => sc.id).join(" "),
                scenarios: fp(
                    list.map((sc) => ({
                        id: sc.id,
                        type: sc.type,
                        pri: sc.pri,
                        loops: sc.loops,
                        path: sc.path.map((v) => `${v.i}:${v.c ? v.c.id : "-"}`).join(">"),
                        covers: (sc.covers || []).map((c) => c.id),
                    }))
                ),
                coverage: fp(coverageLines(list, a.gen, mode)),
                requirements: fp(requirementLines(list, flow)),
                stepsTsv: fp(scenariosToTsv(items)),
                decisionTsv: fp(dt.conditions.length ? decisionToTsv(dt) : ""),
                board: fp(
                    renderScenarios({
                        flow,
                        mode,
                        shown: list,
                        gen: a.gen,
                        counts,
                        issues: a.issues(),
                        origin: [10, 20],
                        generateId: id,
                    })
                ),
                decisionBoard: fp(
                    dt.conditions.length
                        ? renderDecisionTables({ table: dt, flow, mode, name: "Decision table", origin: [10, 20], generateId: id })
                        : null
                ),
                tables: fp(
                    items.length
                        ? renderScenarioTable({ flow: items[0].flow, title: items[0].title, origin: [10, 20], generateId: id })
                        : null
                ),
            };
        }
        let n = 0;
        out[name] = {
            warnings: parsed.warnings,
            counts,
            tip: fp(modeTip(flow, counts)),
            issues: fp(a.issues()),
            flowBoard: fp(renderFlow(flow, () => "f" + ++n, [10, 20])),
            stepsListTsv: fp(flowStepsToTsv(flow)),
            stepsListBoard: fp(
                renderScenarioTables({ scenarios: [{ title: "All steps", flow }], name: "Steps list", origin: [10, 20], generateId: () => "s" + ++n, stepsList: true })
            ),
            modes: perMode,
        };
    }
    return JSON.parse(JSON.stringify(out));
}

test("TEST-13 CORE-03 CORE-11: the pipeline gives the same scenarios, IDs, copied text and board elements as the snapshot", () => {
    const now = snapshot();
    if (process.env.GOLDEN_UPDATE || !existsSync(FILE)) {
        mkdirSync(dirname(FILE), { recursive: true });
        writeFileSync(FILE, JSON.stringify(now, null, 1) + "\n");
        if (!process.env.GOLDEN_UPDATE) console.log("golden snapshot created: " + FILE);
        return;
    }
    const was = JSON.parse(readFileSync(FILE, "utf8"));
    for (const name of Object.keys(was)) assert.deepEqual(now[name], was[name], "flow: " + name);
    assert.deepEqual(Object.keys(now).sort(), Object.keys(was).sort(), "same flows");
});
