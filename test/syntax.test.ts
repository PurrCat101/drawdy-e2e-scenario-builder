// Tests for the text syntax. Run: npm test
//
// The sample flow is a shop checkout with the same structure as a real, large
// flow (12 steps, loops, negative ends, tags and `need` rules). Written in both
// forms it must give the same flow, and the scenario counts must stay
// All 231 / Pairwise 17 / Each-Choice 11.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { formatFlow, hasMarker, needFromWords, needToWords, parseFlowText } from "../src/core/syntax.ts";
import { generate, pick } from "../src/core/scenarios.ts";
import { orderScenarios } from "../src/core/scenarioText.ts";
import { reportHeader } from "../src/core/scenarioText.ts";
import type { Flow } from "../src/core/flow.ts";
import { renderScenarios } from "../src/scenarioBoard.ts";
import { renderFlow } from "../src/render.ts";
import { TEMPLATES, templateById } from "../src/core/templates.ts";
import { validate } from "../src/core/scenarios.ts";

const COMPACT = [
    "Open the shop and sign in (Sign in ok [P1] | !Sign in failed [P2]) >",
    "Check the account (Verified level 1 [tag=lv1 P1] | Verified level 2 [tag=lv2 P1] | !Not verified [P1] | !Under review [P2]) >",
    "Pick from the catalog (Pick a digital item | Pick a normal item | Pick a premium item [tag=premium P1]) >",
    "Add to bag >",
    "Buy more? (~3 Pick more [P2] | Done shopping) >",
    "Open the bag and check out >",
    "Purchase rules API (All rules pass [need=!premium/lv2 P1] | !Level required [need=premium,lv1 P1] | !Service down 503 [P2] | !Out of stock [need=!premium/lv2 P2] | !Not enough funds [need=!premium/lv2 P1]) >",
    "Save purchase and shipment pending >",
    "Shipping worker creates label (Got tracking number [P1] | -~9 Provider down retry [P2 max=2] | !Retries used up [P2]) >",
    "Check the orders page >",
    "Provider updates the shipment >",
    "Delivery result (Delivered [P1] | !Delivery failed [P2])",
].join("\n");

const BLOCKS = `@builder
@title Shop checkout

1. Open the shop and sign in
   - Sign in ok [P1]
   - Sign in failed -> end [P2]
2. Check the account
   - Verified level 1 [P1, sets lv1]
   - Verified level 2 [P1, sets lv2]
   - Not verified -> end [P1]
   - Under review -> end [P2]
3. Pick from the catalog
   - Pick a digital item
   - Pick a normal item
   - Pick a premium item [P1, sets premium]
4. Add to bag
5. Buy more?
   - Pick more -> loop to step 3 [P2]
   - Done shopping
6. Open the bag and check out
7. Purchase rules API
   - All rules pass [P1, needs !premium or lv2]
   - Level required -> end [P1, needs premium and lv1]
   - Service down 503 -> end [P2]
   - Out of stock -> end [P2, needs !premium or lv2]
   - Not enough funds -> end [P1, needs !premium or lv2]
8. Save purchase and shipment pending
9. Shipping worker creates label
   - Got tracking number [P1]
   - Provider down retry -> loop max 2 [P2, negative]
   - Retries used up -> end [P2]
10. Check the orders page
11. Provider updates the shipment
12. Delivery result
   - Delivered [P1]
   - Delivery failed -> end [P2]
`;

/** ids differ between parses; compare the structure, with loop targets as step numbers */
const shape = (flow: Flow) =>
    flow.steps.map((s) => ({
        name: s.name,
        conds: s.conds.map((c) => ({
            label: c.label,
            neg: c.neg,
            action: c.action,
            target: c.target ? flow.steps.findIndex((x) => x.id === c.target) : null,
            max: c.max,
            tags: c.tags,
            need: c.need,
            pri: c.pri,
        })),
    }));

const counts = (flow: Flow) => {
    const all = generate(flow).list.length;
    return {
        all,
        pair: pick(generate(flow), "pair").length,
        min: pick(generate(flow), "min").length,
    };
};

test("SYN-16 SYN-20: the sample flow gives the same counts in both forms", () => {
    const want = { all: 231, pair: 17, min: 11 };
    const compact = parseFlowText(COMPACT);
    const blocks = parseFlowText(BLOCKS);
    assert.equal(compact.format, "compact");
    assert.equal(blocks.format, "blocks");
    assert.deepEqual(compact.warnings, []);
    assert.deepEqual(blocks.warnings, []);
    assert.deepEqual(counts(compact.flow), want);
    assert.deepEqual(counts(blocks.flow), want);
});

test("SYN-20: both forms describe the same flow", () => {
    assert.deepEqual(shape(parseFlowText(BLOCKS).flow), shape(parseFlowText(COMPACT).flow));
});

test("CALC-06: without any option the counts are what the plain text gives", () => {
    const plain = COMPACT.replace(/ ?\[[^\]]*\]/g, "");
    const c = counts(parseFlowText(plain).flow);
    assert.deepEqual(c, { all: 243, pair: 17, min: 11 });
});

test("SYN-01: only a note that starts with @builder is marked", () => {
    assert.equal(hasMarker("@builder\n1. a"), true);
    assert.equal(hasMarker("\n# a comment\n  @BUILDER\n1. a"), true);
    assert.equal(hasMarker("1. a\n- b"), false);
    assert.equal(hasMarker("Login (ok | !fail) > Pay"), false);
    assert.equal(parseFlowText("@builder\nLogin (ok | !fail) > Pay").marked, true);
    assert.equal(parseFlowText("Login (ok | !fail) > Pay").marked, false);
});

test("SYN-02 SYN-20: compact form after the marker, and the title", () => {
    const r = parseFlowText("@builder\n@title Quick\nLogin (ok | !fail) > Pay");
    assert.equal(r.format, "compact");
    assert.equal(r.title, "Quick");
    assert.equal(r.flow.steps.length, 2);
    assert.equal(r.flow.steps[0].conds[1].action, "end");
});

test("SYN-12: keywords: end, loop, loop to step N, next (any case), max N; back and x2 still work", () => {
    const r = parseFlowText(`@builder
1. a
   - one -> END
   - two -> Loop max 3
   - three -> LOOP TO STEP 1 x2
   - four -> next [negative]
   - five -> back 1
`);
    assert.deepEqual(r.warnings, []);
    const c = r.flow.steps[0].conds;
    assert.deepEqual([c[0].action, c[0].neg], ["end", true]);
    assert.deepEqual([c[1].action, c[1].max, c[1].target], ["loop", 3, r.flow.steps[0].id]);
    assert.deepEqual([c[2].action, c[2].max], ["loop", 2]);
    assert.deepEqual([c[3].action, c[3].neg], ["next", true]);
    assert.deepEqual([c[4].action, c[4].target], ["loop", r.flow.steps[0].id]);
});

test("SYN-11: fields belong to the step before its first condition, then to the last condition", () => {
    const r = parseFlowText(`@builder
1. Login
   data: user a
   expect: dialog closes
   setup: stack is up
   req: R-1
   - ok
     data: good password
     expect: token stored
   - bad -> end
     expect: error shown
`);
    assert.deepEqual(r.warnings, []);
    const s = r.flow.steps[0];
    assert.deepEqual([s.data, s.exp, s.pre, s.req], ["user a", "dialog closes", "stack is up", "R-1"]);
    assert.equal(s.conds[0].data, "good password");
    assert.equal(s.conds[0].exp, "token stored");
    assert.equal(s.conds[1].exp, "error shown");
});

test("SYN-10 SYN-11: a value can continue on the next lines; \\ keeps a line that looks like structure", () => {
    const r = parseFlowText(`@builder
1. Pay
   expect: first line
   second line
   \\- not a condition
   \\2. not a step
   - ok
`);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.flow.steps.length, 1);
    assert.equal(r.flow.steps[0].exp, "first line\nsecond line\n- not a condition\n2. not a step");
});

test("SYN-10: comments and blank lines are ignored", () => {
    const r = parseFlowText("@builder\n# note\n// another\n\n1. a\n\n   - b\n");
    assert.deepEqual(r.warnings, []);
    assert.equal(r.flow.steps[0].conds.length, 1);
});

test("SYN-30 SYN-31: mistakes are reported with their line", () => {
    const r = parseFlowText(`@builder
@mod pair
1. a
   datta: x
   - ok [negativ]
   - bad -> loop to step 9
   - odd -> loop to step
5. b
   - more -> loop max
`);
    const w = r.warnings.join("\n");
    assert.match(w, /Line 2: Unknown directive @mod/);
    assert.match(w, /Line 4: Unknown field "datta:" \(did you mean data:\?\)/);
    assert.match(w, /Line 5: Unknown option "negativ" in \[ \] \(did you mean negative\?\)/);
    assert.match(w, /Line 6: There is no step 9 to loop to/);
    assert.match(w, /Line 7: Give the step number/);
    assert.match(w, /Line 9: Cannot read the end of the line/);
});

test("SYN-02: @mode is no longer a directive: the mode is chosen in the window", () => {
    const r = parseFlowText("@builder\n@mode pair\n@ep\n1. a");
    assert.equal(r.warnings.length, 2);
    assert.match(r.warnings[0], /@mode is not used/);
    assert.match(r.warnings[1], /@ep is not used/);
});

test("SYN-31: step numbers: duplicates and gaps", () => {
    const r = parseFlowText("@builder\n1. a\n1. b\n3. c\n2. d");
    const w = r.warnings.join("\n");
    assert.match(w, /Step number 1 is repeated/);
    assert.match(w, /Step number 2 is out of order/);
    // a gap alone is fine: loops refer to the number that was written
    const g = parseFlowText("@builder\n1. a\n5. b\n   - again -> loop to step 5 max 2\n");
    assert.deepEqual(g.warnings, []);
    assert.equal(g.flow.steps[1].conds[0].target, g.flow.steps[1].id);
});

test("SYN-31: compact form: unknown options are reported", () => {
    const r = parseFlowText("a (ok [negativ] | !bad)");
    assert.match(r.warnings.join("\n"), /unknown option "negativ"/);
});

test("CALC-07 SYN-13: need in words and back", () => {
    assert.equal(needFromWords("!master or lv2"), "!master|lv2");
    assert.equal(needFromWords("master and lv1"), "master,lv1");
    assert.equal(needFromWords("not a and b or not c"), "!a,b|!c");
    assert.equal(needToWords("!a,b|!c"), "!a and b or !c");
});

test("SYN-40: writing the flow back and reading it again gives the same flow", () => {
    const first = parseFlowText(BLOCKS);
    const text = formatFlow(first.flow, { title: first.title });
    const again = parseFlowText(text);
    assert.deepEqual(again.warnings, []);
    assert.deepEqual(shape(again.flow), shape(first.flow));
    assert.equal(again.title, "Shop checkout");
    assert.deepEqual(counts(again.flow), { all: 231, pair: 17, min: 11 });
    // and writing it twice changes nothing
    assert.equal(formatFlow(again.flow, { title: again.title }), text);
});

test("SYN-40: the compact form is written out in the blocks form", () => {
    const flow = parseFlowText(COMPACT).flow;
    const back = parseFlowText(formatFlow(flow));
    assert.deepEqual(shape(back.flow), shape(flow));
});

const SPELLED_IN_BRACKETS = `@builder
1. Sign in
   - Log in [P1, sets user lv1]
   - Guest [sets guest]
2. Pay
   - Saved card [needs user and lv1 or premium]
   - Cash [needs !user, sets cod]
   - New card [P1]
`;
const SPELLED_AS_FIELDS = `@builder
1. Sign in
   - Log in [P1]
     sets: user lv1
   - Guest
     sets: guest
2. Pay
   - Saved card
     needs: user and lv1 or premium
   - Cash
     needs: !user
     sets: cod
   - New card [P1]
`;

test("SYN-17: needs: and sets: fields give the same flow and scenarios as the bracket spelling", () => {
    const a = parseFlowText(SPELLED_IN_BRACKETS);
    const b = parseFlowText(SPELLED_AS_FIELDS);
    assert.deepEqual(a.warnings, []);
    assert.deepEqual(b.warnings, []);
    assert.deepEqual(shape(b.flow), shape(a.flow));
    assert.deepEqual(counts(b.flow), counts(a.flow));
    const cash = b.flow.steps[1].conds[1];
    assert.equal(cash.need, "!user");
    assert.equal(cash.tags, "cod");
    assert.equal(b.flow.steps[1].conds[0].need, "user,lv1|premium");
});

test("SYN-17: field names in any case, need: and set: accepted, tags split by spaces or commas, one line only", () => {
    const r = parseFlowText("@builder\n1. a\n   - x\n     SETS: p, q r\n2. b\n   - y\n     Need: p\n     set: z\n     data: d");
    assert.deepEqual(r.warnings, []);
    assert.equal(r.flow.steps[0].conds[0].tags, "p,q,r");
    assert.equal(r.flow.steps[1].conds[0].need, "p");
    assert.equal(r.flow.steps[1].conds[0].tags, "z");
    // a line after needs: is not part of it
    const w = parseFlowText("@builder\n1. a\n   - x\n     needs: p\n     and more words");
    assert.equal(w.flow.steps[0].conds[0].need, "p");
    assert.match(w.warnings.join("\n"), /Cannot read this line/);
});

test("SYN-18: needs: / sets: on a step, with no value, or given twice are reported with their line", () => {
    const onStep = parseFlowText("@builder\n1. a\n   needs: p\n   - x");
    assert.deepEqual(onStep.warnings, ["Line 3: needs: must be under a choice"]);
    assert.ok(!onStep.flow.steps[0].conds[0].need, "the need on a step is ignored");

    const empty = parseFlowText("@builder\n1. a\n   - x\n     sets:");
    assert.deepEqual(empty.warnings, ["Line 4: sets: has no value"]);

    const twice = parseFlowText("@builder\n1. a\n   - x [needs p]\n     needs: q");
    assert.deepEqual(twice.warnings, ["Line 4: needs is given twice (the later one is used)"]);
    assert.equal(twice.flow.steps[0].conds[0].need, "q", "the field wins over the bracket");

    const two = parseFlowText("@builder\n1. a\n   - x\n     sets: p\n     sets: q");
    assert.match(two.warnings.join("\n"), /Line 5: sets is given twice/);
    assert.equal(two.flow.steps[0].conds[0].tags, "q", "the later field wins");
});

test("SYN-31: a typo in needs: / sets: gets a did-you-mean", () => {
    const r = parseFlowText("@builder\n1. a\n   - x\n     nedes: p");
    assert.match(r.warnings.join("\n"), /Unknown field "nedes:" \(did you mean needs:\?\)/);
});

test("SYN-40 SYN-17: sets / needs are written as fields before setup:, the rest stays in the brackets", () => {
    const first = parseFlowText(SPELLED_IN_BRACKETS);
    const text = formatFlow(first.flow);
    assert.match(text, /- Cash\n     needs: !user\n     sets: cod\n/);
    assert.match(text, /- Log in \[P1\]\n     sets: user lv1\n/);
    assert.doesNotMatch(text, /\[[^\]]*(sets|needs)/, "no sets or needs left in a bracket");
    const again = parseFlowText(text);
    assert.deepEqual(again.warnings, []);
    assert.deepEqual(shape(again.flow), shape(first.flow));
    assert.deepEqual(counts(again.flow), counts(first.flow));
    // a choice with sets/needs and its own fields: sets/needs come first and the fields keep their text
    const withFields = parseFlowText("@builder\n1. a\n   - x [P2]\n     data: d1\n     needs: p\n     then: t1\n2. b\n   - p1 [sets p]");
    const out = formatFlow(withFields.flow);
    assert.ok(out.indexOf("needs: p") < out.indexOf("data: d1"), "needs: is written before data:");
    assert.deepEqual(shape(parseFlowText(out).flow), shape(withFields.flow));
});

test("SYN-40: fields survive writing, including lines that look like structure", () => {
    const src = `@builder
1. Pay
   data: card 4242
   expect: first
   - 2. looks like a step
   req: R-9
   - ok [P1]
     data: line one
     - looks like a condition
     expect: done
`;
    const first = parseFlowText(src);
    const again = parseFlowText(formatFlow(first.flow));
    assert.deepEqual(again.warnings, []);
    const a = again.flow.steps[0];
    const f = first.flow.steps[0];
    assert.equal(a.data, f.data);
    assert.equal(a.exp, f.exp);
    assert.equal(a.conds[0].data, f.conds[0].data);
    assert.equal(a.conds[0].exp, f.conds[0].exp);
});

test("CALC-60: an empty or step-less text says so", () => {
    assert.match(parseFlowText("@builder\n- orphan").warnings.join("\n"), /must be under a step/);
    assert.equal(parseFlowText("").flow.steps.length, 0);
});

test("OUT-23 DRV-55: a scenario note is written in the flow syntax and reads back as that scenario", () => {
    const flow = parseFlowText(BLOCKS).flow;
    const gen = generate(flow);
    const shown = pick(gen, "pair");
    const out = renderScenarios({
        flow,
        mode: "pair",
        shown,
        gen,
        counts: { all: 231, pair: 17, min: 11 },
        issues: [],
        origin: [0, 0],
        generateId: (() => {
            let n = 0;
            return () => "e" + ++n;
        })(),
    });
    const notes = out.elements.filter((e: any) => e.meta?.kind === "scenario") as any[];
    assert.equal(notes.length, 17);
    // happy first, then negative; P1 before P2 inside each group
    const types = notes.map((n) => n.meta.type);
    assert.equal(types.indexOf("neg"), types.lastIndexOf("happy") + 1);
    const pri = (n: any) => +n.text.match(/ · P(\d)/)[1];
    const happy = notes.filter((n) => n.meta.type === "happy").map(pri);
    assert.deepEqual(happy, [...happy].sort());
    // every note starts with @builder, keeps full names and reads back
    for (const n of notes) {
        assert.match(n.text, /^@builder\n@title TS[SN]-\d+ · /);
        assert.ok(!n.text.includes("…"));
        const r = parseFlowText(n.text);
        assert.deepEqual(r.warnings, []);
        assert.ok(r.title.startsWith(n.meta.id));
        assert.equal(r.flow.steps.length, new Set(n.meta.path.map((p: any) => p[0])).size);
    }
});

test("OUT-31: scenario notes carry setup, data and expected result, and the table rows match", async () => {
    const { scenarioRows } = await import("../src/core/testSteps.ts");
    const flow = parseFlowText(`@builder
1. Login
   setup: stack is up
   data: user a
   expect: dialog opens
   - ok [P1]
     data: good password
     expect: token stored
   - bad -> end [P2]
     expect: error shown
2. Pay
   - paid [P1]
     expect: receipt
`).flow;
    const gen = generate(flow);
    const shown = pick(gen, "all");
    const out = renderScenarios({
        flow,
        mode: "all",
        shown,
        gen,
        counts: { all: 2, pair: 2, min: 2 },
        issues: [],
        origin: [0, 0],
        generateId: (() => {
            let n = 0;
            return () => "e" + ++n;
        })(),
    });
    const notes = out.elements.filter((e: any) => e.meta?.kind === "scenario") as any[];
    const happy = notes.find((n) => n.meta.type === "happy");
    // written under the first names (SYN-19), although the fixture was typed with given: / then:
    for (const w of ["setup: stack is up", "data: user a", "data: good password", "expect: token stored", "expect: receipt"])
        assert.ok(happy.text.includes(w), w);
    assert.ok(!/\b(given|then):/.test(happy.text), "no second names in what is written");
    // the note reads back, and its table has the same cells
    const back = parseFlowText(happy.text);
    assert.deepEqual(back.warnings, []);
    const rows = scenarioRows(back.flow);
    assert.equal(rows[0].data, "user a\ngood password");
    assert.equal(rows[0].exp, "dialog opens\ntoken stored");
    assert.equal(rows[0].pre, "stack is up");
});

test("SYN-19 SYN-10: setup / expect and given / then are the same fields, and setup / expect are written back", () => {
    const a = parseFlowText("@builder\n1. a\n   given: g\n   then: t\n   - ok\n");
    const b = parseFlowText("@builder\n1. a\n   setup: g\n   expect: t\n   - ok\n");
    assert.deepEqual(a.warnings, []);
    assert.deepEqual(b.warnings, []);
    assert.equal(a.flow.steps[0].pre, "g");
    assert.equal(a.flow.steps[0].exp, "t");
    assert.deepEqual(shape(a.flow), shape(b.flow));
    // either way the first names are written, and read back to the same flow
    for (const f of [a.flow, b.flow]) {
        const out = formatFlow(f);
        assert.ok(out.includes("   setup: g") && out.includes("   expect: t"));
        assert.ok(!out.includes("given:") && !out.includes("then:"));
        assert.deepEqual(shape(parseFlowText(out).flow), shape(f));
    }
    // on a choice too, and in any letter case
    const c = parseFlowText("@builder\n1. a\n   - ok\n     GIVEN: g1\n     Then: t1\n   - bad\n     Setup: g2\n     EXPECT: t2\n");
    assert.deepEqual(c.warnings, []);
    assert.deepEqual(c.flow.steps[0].conds.map((x) => [x.pre, x.exp]), [["g1", "t1"], ["g2", "t2"]]);
    // a typo is pointed at a field name
    assert.match(parseFlowText("@builder\n1. a\n   gven: x\n").warnings.join(""), /given:|setup:/);
});

test("SYN-19: a field written twice, under either name, keeps both texts in the order written", () => {
    const f = parseFlowText("@builder\n1. a\n   setup: first\n   given: second\n   data: d\n   expect: x\n   then: y\n   - ok\n").flow;
    assert.deepEqual(f.steps[0].pre, "first\nsecond");
    assert.deepEqual(f.steps[0].exp, "x\ny");
    const out = formatFlow(f);
    assert.ok(out.includes("   setup: first\n     second"), out);
    assert.deepEqual(shape(parseFlowText(out).flow), shape(f));
});

test("SYN-19: setup is text, not a condition: it does not change which scenarios exist", () => {
    const plain = parseFlowText("@builder\n1. a\n   - x\n   - y\n2. b\n   - p\n");
    const withSetup = parseFlowText("@builder\n1. a\n   setup: the stock is 0\n   - x\n     setup: s\n   - y\n2. b\n   - p\n");
    assert.deepEqual(counts(withSetup.flow), counts(plain.flow));
    assert.equal(generate(withSetup.flow).list.length, generate(plain.flow).list.length);
});

test("SYN-19 SYN-41: the starter template and the README example use the first names", () => {
    for (const t of TEMPLATES) {
        const fields = t.text.split("\n").filter((l) => !l.trim().startsWith("#"));
        assert.ok(fields.some((l) => /^\s+setup:/.test(l)) && fields.some((l) => /^\s+expect:/.test(l)));
        assert.ok(!fields.some((l) => /^\s+(given|then):/.test(l)), "no second names in the template's lines");
    }
});

test("OUT-32: scenarios as tab-separated text for a spreadsheet", async () => {
    const { scenariosToTsv } = await import("../src/core/testSteps.ts");
    const flow = parseFlowText("@builder\n1. Login\n   given: g\n   data: line one\n   line two\n   then: t\n   - ok\n").flow;
    const tsv = scenariosToTsv([{ title: "TSS-001 · Happy · P1   ok", flow }]);
    const lines = tsv.split("\n");
    assert.equal(lines[0], "Scenario\t#\tStep\tCondition\tSetup\tTest data\tExpected result");
    // a cell with two lines is quoted, so a spreadsheet keeps it in one cell
    assert.equal(lines[1], 'TSS-001 · Happy · P1\t1\t1. Login\tok\tg\t"line one\nline two"'.split("\n")[0]);
    assert.ok(tsv.includes('"line one\nline two"\tt'));
});

test("SYN-41 OUT-40: starter templates: marked, read without warnings, make scenarios, no flow errors", () => {
    assert.deepEqual(TEMPLATES.map((t) => t.id), ["shop"]);
    // the template uses every piece of the syntax: a check that it still does
    const shop = parseFlowText(TEMPLATES[0].text).flow;
    const all = shop.steps.flatMap((s) => s.conds);
    const has = (f: (c: (typeof all)[number]) => boolean) => all.some(f);
    assert.ok(has((c) => c.action === "loop" && c.distinct), "a distinct loop");
    assert.ok(TEMPLATES[0].text.includes("-> loop to step 2 max 1 [distinct]"), "written with max");
    assert.ok(has((c) => c.action === "end" && c.neg), "an end (negative)");
    assert.ok(has((c) => !!c.tags), "a sets");
    assert.ok(has((c) => !!c.need && /[|,!]/.test(c.need)), "a needs with or / not");
    assert.ok(shop.steps.some((s) => s.req), "a req on a step");
    // SYN-41: every step has an expected result, its own or one on each of its choices,
    // and it is a value (a digit or an upper-case code), not just "works"
    for (const s of shop.steps) {
        const exps = s.exp ? [s.exp] : s.conds.map((c) => c.exp || "");
        assert.ok(exps.length > 0 && exps.every((e) => /\d|[A-Z]{3,}/.test(e)), `step ${s.id}: expected result with a value`);
    }
    assert.ok(!/lab-/.test(TEMPLATES[0].text), "no lab- prefix on the account");
    for (const t of TEMPLATES) {
        assert.ok(hasMarker(t.text), t.id + ": starts with @builder");
        const r = parseFlowText(t.text);
        assert.deepEqual(r.warnings, [], t.id + ": no reading warnings");
        assert.ok(r.flow.steps.length >= 2, t.id + ": has steps");
        const gen = generate(r.flow);
        assert.ok(gen.list.length >= 2, t.id + ": makes scenarios");
        assert.deepEqual(
            validate(r.flow, gen).filter((i) => i.lv === "err"),
            [],
            t.id + ": no flow errors"
        );
        assert.ok(/^#/m.test(t.text), t.id + ": explains the syntax in comments");
    }
    assert.equal(templateById("nope"), undefined);
});

test("OUT-10: the flow diagram has plain words only (no distinct, sets, needs, P1)", () => {
    let n = 0;
    const r = renderFlow(parseFlowText(TEMPLATES[0].text).flow, () => "e" + ++n, [0, 0]);
    // everything a viewer can read: the arrow labels and the text on the shapes
    const seen = [
        ...r.labels.map((l) => l.text),
        ...(r.elements as any[]).map((e) => e.text).filter((t) => typeof t === "string"),
    ].join("\n");
    assert.ok(/Add another product ↻ up to 1 time(?!s)/.test(seen), seen);
    assert.ok(!/distinct|\bsets\b|\bneeds\b|\bP[123]\b|≤/.test(seen), "no syntax words on the diagram: " + seen);
    let m = 0;
    const one = renderFlow(parseFlowText("@builder\n1. A\n- go -> loop to step 1\n2. B\n- ok").flow, () => "x" + ++m, [0, 0]);
    assert.ok(one.labels.some((l) => /go ↻ up to 1 time$/.test(l.text)));
});

test("OUT-12: a choice label stays on one line and its arrow is long enough for it", () => {
    let n = 0;
    const flow = parseFlowText(TEMPLATES[0].text).flow;
    const r = renderFlow(flow, () => "e" + ++n, [0, 0]);
    const steps = (r.elements as any[]).filter((e) => e.meta?.kind === "step");
    const labels = new Set(flow.steps.flatMap((s) => s.conds.map((c) => c.label)));
    flow.steps.forEach((s, i) => {
        const nexts = s.conds.filter((c) => c.action === "next");
        if (!nexts.length || i === flow.steps.length - 1) return;
        const gap = steps[i + 1].x - (steps[i].x + steps[i].width);
        for (const c of nexts) assert.ok(gap >= c.label.length * 6.6, `${c.label}: arrow ${gap} is too short`);
    });
    // every line of an arrow label is a whole choice label, none is cut in two
    for (const l of r.labels) {
        if (/↻/.test(l.text)) continue;
        for (const line of l.text.split("\n")) assert.ok(labels.has(line), `"${line}" is not a whole label`);
    }
});

test("SYN-41 CALC-65: the starter template has no flow check item, not even a warning", () => {
    for (const t of TEMPLATES) {
        const flow = parseFlowText(t.text).flow;
        assert.deepEqual(validate(flow, generate(flow)).map((i) => i.msg), [], t.id);
    }
});

test("SYN-41: starter templates: the comments do not change the flow", () => {
    for (const t of TEMPLATES) {
        const bare = t.text
            .split("\n")
            .filter((l) => !/^\s*#/.test(l))
            .join("\n");
        assert.deepEqual(
            generate(parseFlowText(bare).flow).list.length,
            generate(parseFlowText(t.text).flow).list.length,
            t.id
        );
    }
});

/* ------------------------------ distinct loops ----------------------------- */

const SHOP = (opts: string) => `1. Sign in
- ok
2. Pick
- A
- B
- C
- sold out -> end
3. More?
- again -> loop to step 2 max 2${opts}
- done
4. Pay
- paid`;

const picks = (text: string) =>
    generate(parseFlowText(text).flow)
        .list.filter((s) => s.type === "happy")
        .map((s) => s.path.filter((v) => v.i === 1 && v.c).map((v) => v.c!.label).join("+"));

test("CALC-14 CALC-16: distinct loop: no choice twice, and a set of picks only once whatever the order", () => {
    // plain loop: 3 + 3*3 + 3*3*3 ordered picks, repeats included
    assert.equal(picks(SHOP("")).length, 3 + 9 + 27);
    const d = picks(SHOP(" [distinct]"));
    // distinct: subsets of {A,B,C} of size 1..3 = 3 + 3 + 1
    assert.deepEqual([...d].sort(), ["A", "A+B", "A+B+C", "A+C", "B", "B+C", "C"]);
});

test("CALC-14: distinct loop: an end at the step it goes back to stays available every round", () => {
    const flow = parseFlowText(SHOP(" [distinct]")).flow;
    const ends = generate(flow).list.filter(
        (s) => s.type === "neg" && s.path[s.path.length - 1].c!.label === "sold out"
    );
    // sold out on round 1, after 1 pick (3 ways), after 2 picks (3 ways)
    assert.equal(ends.length, 1 + 3 + 3);
});

test("SYN-15: distinct: read, written back, and warned about when not on a loop", () => {
    const r = parseFlowText(SHOP(" [P2, distinct]"));
    assert.deepEqual(r.warnings, []);
    const again = r.flow.steps[2].conds[0];
    assert.equal(again.distinct, true);
    assert.match(formatFlow(r.flow), /-> loop to step 2 max 2 \[P2, distinct\]/);
    const bad = parseFlowText("1. a\n- x [distinct]\n- y -> end [distinct]");
    assert.equal(bad.warnings.length, 2);
    assert.ok(bad.warnings.every((w) => /distinct only works with loop/.test(w)));
    assert.ok(bad.flow.steps[0].conds.every((c) => !c.distinct));
});

const rounds = (text: string, steps: number[]) =>
    generate(parseFlowText(text).flow)
        .list.filter((s) => s.type === "happy")
        .map((s) =>
            steps
                .map((i) => s.path.filter((v) => v.i === i && v.c).map((v) => v.c!.label).join("+"))
                .join(" | ")
        )
        .sort();

test("CALC-14: distinct holds back only the step it goes back to, not the steps after it", () => {
    const t = "1. pick\n- A\n- B\n2. qty\n- one\n- two\n3. more\n- again -> loop to step 1 [distinct]\n- done";
    assert.deepEqual(rounds(t, [0, 1]), [
        "A+B | one+one",
        "A+B | one+two",
        "A+B | two+one",
        "A+B | two+two",
        "A | one",
        "A | two",
        "B | one",
        "B | two",
    ].sort());
});

test("CALC-18: distinct with needs: a set is kept even when only one order is allowed", () => {
    const t = "1. pick\n- A [needs c]\n- B\n- C [sets c]\n2. more\n- again -> loop to step 1 [distinct]\n- done";
    // A needs C first, so {A, C} only exists as C then A; it must not be lost
    assert.deepEqual(rounds(t, [0]), ["B", "B+C", "C", "C+A"]);
});

test("CALC-15: distinct ends with the run: a later plain loop back to the same step picks freely", () => {
    const t =
        "1. pick\n- A\n- B\n2. more\n- again -> loop to step 1 [distinct]\n- done\n3. retry\n- redo -> loop to step 1\n- ok";
    const r = rounds(t, [0]);
    assert.ok(r.includes("A+B+A") && r.includes("A+B+B"), r.join(", "));
});

test("CALC-65: validate warns when distinct does nothing or asks for more rounds than choices", () => {
    const issues = (t: string) => {
        const f = parseFlowText(t).flow;
        return validate(f, generate(f)).filter((i) => /distinct|different picks/.test(i.msg)).map((i) => i.msg);
    };
    assert.deepEqual(issues("1. a\n- A\n- B\n2. b\n- again -> loop to step 1 [distinct]\n- done"), []);
    assert.match(issues("1. a\n- A\n- B\n2. b\n- again -> loop to step 1 max 2 [distinct]\n- done")[0], /3 different picks at step 1, which has 2/);
    assert.match(issues("1. a\n2. b\n- again -> loop to step 1 [distinct]\n- done")[0], /step 1 has no choices/);
    assert.match(issues("1. a\n- retry -> loop max 2 [distinct]\n- ok")[0], /earlier step/);
});

test("CALC-41: a happy scenario that passes a [negative] choice says so in its title", () => {
    const t = "1. ship\n- ok\n- provider down -> loop max 1 [negative]\n2. done\n- delivered";
    const gen = generate(parseFlowText(t).flow);
    let n = 0;
    const out = renderScenarios({
        flow: parseFlowText(t).flow,
        mode: "all",
        shown: gen.list,
        gen,
        counts: { all: gen.list.length, pair: 0, min: 0 },
        issues: [],
        origin: [0, 0],
        generateId: () => "e" + ++n,
    });
    const titles = (out.elements as any[]).filter((e: any) => typeof e.text === "string" && /TS[SN]-\d+/.test(e.text))
        .map((e: any) => e.text.split("\n").find((l: string) => /TS[SN]-/.test(l)));
    assert.equal(titles.filter((x: string) => /via negative/.test(x)).length, 1, titles.join(" / "));
    assert.ok(titles.some((x: string) => /Happy/.test(x) && !/via negative/.test(x)));
});

/* ------------------- the worked examples in the README --------------------- */

test("CALC-04 CALC-11: README: the worked counting examples are in the README and give the numbers it states", () => {
    // a Windows checkout (autocrlf) turns README into CRLF; template literals below are always LF
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const A = `1. Sign in
- ok
- failed -> end
2. Pick an item
- shirt
- shoes
- sold out -> loop to step 2 [negative]
3. Pay
- paid
- declined -> end`;
    const B = `1. Account
- level 1 [sets lv1]
- level 2 [sets lv2]
2. Buy a premium item
- allowed [needs lv2]
- blocked -> end [needs lv1]`;
    assert.ok(readme.includes(A), "example A is in the README, word for word");
    assert.ok(readme.includes(B), "example B is in the README, word for word");

    const a = generate(parseFlowText(A).flow);
    assert.equal(a.list.length, 9);
    assert.equal(a.list.filter((s) => s.type === "happy").length, 4);
    assert.equal(a.list.filter((s) => s.type === "neg").length, 5);
    // the number on each arrow of the diagram: scenarios that use the choice
    const used: Record<string, number> = {};
    a.list.forEach((s) => s.path.forEach((v) => v.c && (used[v.c.label] = (used[v.c.label] || 0) + 1)));
    assert.deepEqual(used, { ok: 8, failed: 1, shirt: 4, shoes: 4, "sold out": 4, paid: 4, declined: 4 });
    for (const [label, n] of Object.entries(used))
        assert.ok(
            readme.includes(`${label} · ${n}`) || readme.includes(`${label} ↻ · ${n}`),
            `the diagram says "${label} · ${n}"`
        );

    const b = generate(parseFlowText(B).flow);
    assert.equal(b.list.length, 2);
    assert.deepEqual(b.list.map((s) => s.type).sort(), ["happy", "neg"]);
});

test("SYN-41: README: the syntax example is the starter template, word for word", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const text = TEMPLATES[0].text.trimEnd();
    assert.ok(readme.includes(text), "the whole starter template is in the README");
    // the short example at the top is the first steps of it: every line is a line of the template
    const top = readme.slice(readme.indexOf("```\n@builder") + 4, readme.indexOf("```", readme.indexOf("```\n@builder") + 4));
    const lines = new Set(text.split("\n"));
    for (const l of top.split("\n").filter((x) => x.trim())) assert.ok(lines.has(l), `not in the template: ${l}`);
    // the one-line form example reads without warnings
    const one = readme.match(/```\n(@builder\n[^\n]+ > [^\n]+)\n```/);
    assert.ok(one, "a one-line example");
    const r = parseFlowText(one![1]);
    assert.deepEqual(r.warnings, []);
    assert.ok(r.flow.steps.length >= 3);
});

test("README: every link in the contents points at a heading of the README", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9 _-]/g, "").replace(/ /g, "-");
    const heads = new Set<string>();
    let fence = false;
    for (const l of readme.split("\n")) {
        if (l.startsWith("```")) fence = !fence;
        const m = !fence && l.match(/^#{2,4} (.+)$/);
        if (m) heads.add(slug(m[1]));
    }
    const toc = readme.slice(readme.indexOf("## Contents"), readme.indexOf("\n## Terms"));
    const links = [...toc.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(links.length >= 15, "the contents has links");
    for (const a of links) assert.ok(heads.has(a), `no heading for #${a}`);
    // and every heading is in the contents
    for (const h of heads) if (h !== "contents") assert.ok(links.includes(h), `#${h} is not in the contents`);
});

test("CALC-21 CALC-64: past 1,000 paths: the late choices are found, and the message says what was done", () => {
    const text =
        Array.from({ length: 7 }, (_, i) => `${i + 1}. S${i + 1}\n- a${i}\n- b${i}\n- c${i}`).join("\n") +
        "\n8. Last\n- ok\n- late";
    const flow = parseFlowText(text).flow;
    const g = generate(flow);
    assert.ok(g.capped);
    assert.ok((g.extra ?? 0) > 0);
    for (const mode of ["pair", "min"] as const) {
        const got = new Set(pick(g, mode).flatMap((sc) => sc.path.filter((v) => v.c).map((v) => v.c!.label)));
        for (const l of ["b0", "c0", "late"]) assert.ok(got.has(l), `${mode} has ${l}`);
    }
    const msgs = validate(flow, g).map((i) => i.msg);
    assert.ok(msgs.some((m) => /All lists the first 1,000, plus \d+ found/.test(m)), msgs.join(" / "));
    assert.ok(!msgs.some((m) => /no path can take/.test(m)));
});

/** One step of `n` choices, taken again in `distinct` rounds, in any order. */
const pickMany = (n: number) =>
    "1. pick\n" + [..."abcdefghi"].slice(0, n).map((x) => "- " + x).join("\n") +
    `\n2. more\n- no\n- yes -> loop to step 1 max ${n - 1} [distinct]`;

test("CALC-24 CALC-16: orders of the same rounds do not count toward the 1,000: every different path is listed", () => {
    // 8 choices: 2^8 - 1 = 255 different sets of rounds, walked in over 100,000 orders
    const g = generate(parseFlowText(pickMany(8)).flow);
    assert.equal(g.capped, false);
    assert.equal(g.list.length, 255);
});

test("CALC-24 CALC-64 OUT-21: when the walk stops at its bound, the warning and the header say the list is a part", () => {
    const flow = parseFlowText(pickMany(9)).flow;
    const g = generate(flow);
    assert.ok(g.capped);
    assert.ok(g.list.length < 511, "9 choices have 511 different sets: " + g.list.length);
    const msgs = validate(flow, g).map((i) => i.msg);
    assert.ok(msgs.some((m) => m.includes(`All lists the ${g.list.length} scenarios found first`)), msgs.join(" / "));
    assert.ok(!msgs.some((m) => /first 1,000/.test(m)));
    const counts = { all: 20, pair: 1, min: 2 };
    const head = reportHeader({ flow, mode: "all", shown: g.list, gen: g, counts, issues: [] });
    assert.ok(head[1].startsWith(`${g.list.length} of ${g.list.length} listed paths (the flow has more)`), head[1]);
    assert.match(head[2], /^All 20\+ · /);
    assert.ok(!head.some((l) => /^TIP/.test(l)), head.join(" / "));
});

test("CALC-36: every mode tests the last round a loop allows", () => {
    const flow = parseFlowText("1. pick\n- A\n- B\n2. more\n- again -> loop to step 1 max 3\n- done\n3. pay\n- ok").flow;
    const g = generate(flow);
    for (const mode of ["pair", "min"] as const)
        assert.equal(Math.max(...pick(g, mode).map((s) => s.loops)), 3, mode);
});

// the checkout of the Demo board: one "add more" loop and three ways to fail
const SCK = [
    "1. More product?", "- add -> loop to step 1", "- no more",
    "2. Pay", "- paid", "- declined -> end",
    "3. Receive?", "- received", "- refused -> end",
    "4. Confirm?", "- confirmed", "- not confirmed -> end",
].join("\n");

test("CALC-28 CALC-33 CALC-34: Pair and Each both test the checkout without the loop and with it", () => {
    const g = generate(parseFlowText(SCK).flow);
    assert.equal(g.list.length, 8);
    const shape = (mode: "pair" | "min") => pick(g, mode).map((s) => s.type + " " + s.loops).sort();
    assert.deepEqual(shape("pair"), ["happy 0", "happy 1", "neg 1", "neg 1", "neg 1"]);
    assert.deepEqual(shape("min"), ["happy 0", "happy 1", "neg 0", "neg 0", "neg 0"]);
});

test("CALC-28 OUT-21: a selection without the plain way through says the base path is missing", async () => {
    const { coverageLines } = await import("../src/core/scenarioText.ts");
    const g = generate(parseFlowText(SCK).flow);
    const lines = coverageLines(g.list.filter((s) => s.loops === 1), g, "pair");
    assert.ok(lines.some((l) => /^MISSING base path/.test(l)), lines.join(" / "));
    assert.ok(!lines.some((l) => /^OK/.test(l)), lines.join(" / "));
});

test("CALC-09 CALC-63: a choice that can never be taken says why, and is listed as unreachable", () => {
    const flow = parseFlowText("1. a\n- x\n2. b\n- y [needs z]\n- ok").flow;
    const g = generate(flow);
    assert.equal(g.unreachable?.length, 1);
    assert.ok(validate(flow, g).some((i) => /y: no path can take this choice/.test(i.msg)));
});

test("OUT-21: the coverage lines say OK when a mode keeps its promise, and name what is missing when not", async () => {
    const { coverageLines } = await import("../src/core/scenarioText.ts");
    const flow = parseFlowText("1. pick\n- A\n- B\n2. more\n- again -> loop to step 1 max 2\n- done\n3. pay\n- ok\n- no -> end").flow;
    const g = generate(flow);
    for (const mode of ["all", "pair", "min"] as const) {
        const lines = coverageLines(pick(g, mode), g, mode);
        assert.match(lines[0], /^Coverage of \d+ scenarios: choice (\d+)\/\1 \(100%\) · loop end 1\/1 \(100%\) · pair/);
        assert.match(lines[1], /^OK: every choice, every loop end/, mode);
    }
    // a hand-made selection that leaves things out
    const one = [g.list.find((s) => s.type === "happy" && s.loops === 0)!];
    const lines = coverageLines(one, g, "min");
    assert.ok(lines.some((l) => /^MISSING choices: .*"no"/.test(l)), lines.join(" / "));
    assert.ok(lines.some((l) => /^MISSING loop ends: "again"/.test(l)), lines.join(" / "));
});

test("OUT-25: requirements: each req lists the scenarios that pass it, and a missing one is named", async () => {
    const { requirementLines } = await import("../src/core/scenarioText.ts");
    const flow = parseFlowText("1. Sign in\n   req: R-1\n- ok\n- bad -> end\n  req: R-2\n2. Pay\n   req: R-3, R-4\n- paid").flow;
    const g = generate(flow);
    const lines = requirementLines(g.list, flow);
    assert.equal(lines[0], "Requirements: 4/4 covered");
    assert.ok(lines.some((l) => /^  R-1 → TS[SN]-\d+, TS[SN]-\d+$/.test(l)), lines.join(" / "));
    assert.ok(lines.some((l) => /^  R-2 → TSN-\d+$/.test(l)), lines.join(" / "));
    assert.ok(lines.some((l) => /^  R-4 → TSS-\d+$/.test(l)), lines.join(" / "));
    // only the negative scenario: R-3 and R-4 are not covered
    const neg = requirementLines(g.list.filter((s) => s.type === "neg"), flow);
    assert.equal(neg[0], "Requirements: 2/4 covered");
    assert.equal(neg[neg.length - 1], "MISSING requirements: R-3, R-4");
    assert.deepEqual(requirementLines(g.list, parseFlowText("1. a\n- b").flow), []);
});

test("CALC-50 CALC-55: scenario IDs run TSS-001.. and TSN-001.. in list order", () => {
    // 3 Happy and 2 Negative: Sign in (ok / bad ends), Pick (shirt / shoes / hat)
    const g = generate(parseFlowText("1. Sign in\n- ok\n- bad -> end\n2. Pick\n- shirt\n- shoes\n- hat").flow);
    assert.deepEqual(
        g.list.map((s) => s.id),
        ["TSS-001", "TSS-002", "TSS-003", "TSN-001"]
    );
    assert.deepEqual(
        g.list.map((s) => s.type),
        ["happy", "happy", "happy", "neg"]
    );
    const two = generate(parseFlowText("1. a\n- ok\n- x -> end\n- y -> end\n2. b\n- p\n- q").flow);
    assert.deepEqual(
        two.list.map((s) => s.id),
        ["TSS-001", "TSS-002", "TSN-001", "TSN-002"]
    );
});

test("CALC-55 OUT-22: IDs run up in the order the scenarios are shown, by priority first, so a P2 negative is not numbered before a P1 one", () => {
    const g = generate(parseFlowText("1. a\n- ok\n- x -> end [P2]\n- y -> end [P1]\n2. b\n- p\n- q").flow);
    const shown = orderScenarios(g.list).map((s) => s.id);
    assert.deepEqual(shown, ["TSS-001", "TSS-002", "TSN-001", "TSN-002"]);
    assert.equal(g.list.find((s) => s.pri === 1)!.id, "TSN-001", "the P1 negative takes the first negative number");
});

test("CALC-55 OUT-22: past 999 the IDs still run up in the shown order (TSS-1000 after TSS-999, not after TSS-100)", () => {
    const list = [1000, 2, 101, 100].map((n) => ({ id: "TSS-" + String(n).padStart(3, "0"), type: "happy", pri: 1 }));
    assert.deepEqual(orderScenarios(list as any).map((s) => s.id), ["TSS-002", "TSS-100", "TSS-101", "TSS-1000"]);
});

test("CALC-56: the same flow gives the same IDs; a new scenario moves only the ones after it", () => {
    const base = "1. Sign in\n- ok\n- bad -> end\n2. Pick\n- shirt\n- shoes\n3. Pay\n- paid\n- declined -> end";
    const ids = (t: string) => generate(parseFlowText(t).flow).list.map((s) => s.id);
    const before = ids(base);
    assert.deepEqual(ids(base), before, "same flow, same IDs");
    // a choice added to the last step is one more scenario of each Happy/Negative run:
    // IDs stay a gapless running count of the same prefixes
    const after = ids(base.replace("- shoes", "- shoes\n- hat"));
    for (const prefix of ["TSS", "TSN"]) {
        const nums = after.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(4)));
        assert.deepEqual(nums, nums.map((_, i) => i + 1), prefix + " counts 1, 2, 3...");
    }
    assert.ok(after.length > before.length);
});

test("CALC-57: a mode numbers only what it picks (Pair: 3 Happy and 2 Negative end at TSS-003 and TSN-002)", () => {
    // All: 9 Happy and 2 Negative. Each-choice needs 3 Happy (3 picks x 3 sizes) + 2 Negative.
    const flow = parseFlowText(
        "1. Sign in\n- ok\n- bad1 -> end\n- bad2 -> end\n2. Pick\n- shirt\n- shoes\n- hat\n3. Size\n- s\n- m\n- l"
    ).flow;
    const g = generate(flow);
    assert.equal(g.list.filter((s) => s.type === "happy").length, 9);
    assert.equal(g.list.filter((s) => s.type === "happy").at(-1)!.id, "TSS-009");
    const min = pick(g, "min");
    assert.deepEqual(
        min.map((s) => s.id),
        ["TSS-001", "TSS-002", "TSS-003", "TSN-001", "TSN-002"]
    );
    // All keeps its own numbering, and the pick keeps the place in All (`n`)
    assert.deepEqual(pick(g, "all").map((s) => s.id), g.list.map((s) => s.id));
    assert.ok(min.every((s) => g.list.find((a) => a.n === s.n)!.path === s.path));
});

test("CALC-50: a running number past 999 just grows (TSS-1000)", () => {
    // 11 steps of 3 choices: 3^7 = 2187 paths would pass the limit, so use 1000+ via a high limit
    const text = Array.from({ length: 7 }, (_, i) => `${i + 1}. S${i}\n- a\n- b\n- c`).join("\n");
    const g = generate(parseFlowText(text).flow, 5000);
    assert.equal(g.list.length, 2187);
    assert.equal(g.list[0].id, "TSS-001");
    assert.equal(g.list[1000].id, "TSS-1001");
    assert.equal(new Set(g.list.map((s) => s.id)).size, g.list.length);
});

test("CALC-25: a scenario takes the most important P on its path (the lowest number)", () => {
    const g = generate(parseFlowText("1. a\n- x [P1]\n- y\n2. b\n- p [P3]\n- q").flow);
    const pri = (labels: string) => g.list.find((s) => s.path.map((v) => v.c?.label).join(">") === labels)!.pri;
    assert.equal(pri("x>p"), 1, "P1 and P3 on the path: P1");
    assert.equal(pri("x>q"), 1);
    assert.equal(pri("y>p"), 3, "only P3 on the path: P3");
    assert.equal(pri("y>q"), 2, "no P at all: P2");
});

// ---- the search time budget (CALC-22) and the flow check (CALC-13, CALC-61, CALC-62, CALC-66) ----

const BIG_FLOW =
    Array.from({ length: 7 }, (_, i) => `${i + 1}. S${i + 1}\n- a${i}\n- b${i}\n- c${i}`).join("\n") +
    "\n8. Last\n- ok\n- late";
const messages = (text: string) => {
    const flow = parseFlowText(text).flow;
    return validate(flow, generate(flow));
};

test("CALC-22: the search past 1,000 paths has a time budget; when it runs out the result says so and the flow check says what is uncertain", async () => {
    const { analyze, clearCache, FULL_BUDGET_MS, PREVIEW_BUDGET_MS } = await import("../src/core/analysis.ts");
    assert.equal(FULL_BUDGET_MS, 3000);
    assert.equal(PREVIEW_BUDGET_MS, 300);
    const flow = parseFlowText(BIG_FLOW).flow;
    // a budget already used up: the walk is capped, the search stops before it finds anything
    const out = generate(flow, 1000, -1);
    assert.ok(out.capped);
    assert.equal(out.searchComplete, false);
    assert.equal(out.pairsComplete, false);
    const msgs = validate(flow, out).map((i) => i.msg);
    assert.ok(msgs.some((m) => /not in any scenario: the flow is too big to finish the search/.test(m)), msgs.join(" / "));
    assert.ok(msgs.some((m) => /not every pair \(the search ran out of time\)/.test(m)), msgs.join(" / "));
    // with its normal budget the same flow finishes
    const full = generate(flow);
    assert.equal(full.searchComplete, true);
    assert.equal(full.pairsComplete, true);
    // a flow under the limit has no search to run out
    assert.equal(generate(parseFlowText("1. a\n- x\n- y").flow, 1000, -1).searchComplete, true);
    // the analysis reports it, and a full-budget press works the flow out again
    clearCache();
    assert.equal(analyze(flow, -1).complete, false);
    assert.equal(analyze(flow, FULL_BUDGET_MS).complete, true);
});

test("CALC-61: no scenario at all is an error", () => {
    const res = messages("1. a\n- x [needs z]\n2. b\n- y [sets z]");
    assert.equal(res[0].lv, "err");
    assert.match(res[0].msg, /^No scenarios/);
});

test("CALC-62: a step no scenario reaches is an error, and a step none of whose choices continues is a warning", () => {
    const res = messages("1. a\n- x -> end\n2. b\n- y");
    assert.ok(res.some((i) => i.lv === "err" && /2\. b: no scenario reaches this step/.test(i.msg)), JSON.stringify(res));
    assert.ok(res.some((i) => i.lv === "warn" && /1\. a: no condition continues to the next step/.test(i.msg)), JSON.stringify(res));
    // the last step is allowed to have no choice that continues
    assert.ok(!messages("1. a\n- x\n2. b\n- y -> end").some((i) => /no condition continues/.test(i.msg)));
});

test("CALC-62: a choice without a label is an error, a duplicate label in one step is a warning", () => {
    const flow = parseFlowText("1. a\n- x\n- y\n2. b\n- ok").flow;
    flow.steps[0].conds[0].label = "  ";
    const res = validate(flow, generate(flow));
    assert.ok(res.some((i) => i.lv === "err" && /1\. a: a condition has no label/.test(i.msg)), JSON.stringify(res));
    const dup = messages("1. a\n- x\n- x\n2. b\n- ok");
    assert.ok(dup.some((i) => i.lv === "warn" && /1\. a: duplicate condition "x"/.test(i.msg)), JSON.stringify(dup));
});

test("CALC-62: a loop to a missing step is an error", () => {
    const flow = parseFlowText("1. a\n- again -> loop to step 1\n- go\n2. b\n- ok").flow;
    flow.steps[0].conds.find((c) => c.action === "loop")!.target = "no-such-step";
    const res = validate(flow, generate(flow));
    assert.ok(res.some((i) => i.lv === "err" && /again: loops to a missing step/.test(i.msg)), JSON.stringify(res));
});

test("CALC-62 CALC-13: a loop pointing forward is a warning, and acts as a skip", () => {
    const flow = parseFlowText("1. a\n- again -> loop to step 2\n- go\n2. b\n- ok").flow;
    const g = generate(flow);
    const res = validate(flow, g);
    assert.ok(res.some((i) => i.lv === "warn" && /again: loop points forward \(acts as a skip\)/.test(i.msg)), JSON.stringify(res));
    // the skip: the choice is taken once and the path goes on, so no path repeats a step
    assert.ok(g.list.every((s) => s.path.length === 2 && s.loops <= 1));
    assert.ok(g.list.some((s) => s.path.some((v) => v.c?.label === "again")));
});

test("CALC-62: a `needs` tag nobody `sets` is an error", () => {
    const res = messages("1. a\n- x\n2. b\n- y [needs ghost]\n- ok");
    assert.ok(res.some((i) => i.lv === "err" && /y: need "ghost" but no condition sets that tag/.test(i.msg)), JSON.stringify(res));
});

test("CALC-66: errors are listed before warnings", () => {
    // this flow has both: a step nobody reaches (error) and a step that does not continue (warning)
    const res = messages("1. a\n- x -> end\n2. b\n- y");
    assert.ok(res.some((i) => i.lv === "err") && res.some((i) => i.lv === "warn"));
    const firstWarn = res.findIndex((i) => i.lv === "warn");
    assert.ok(res.slice(firstWarn).every((i) => i.lv === "warn"), JSON.stringify(res));
});

test("SYN-22: [variant] and @ep of version 0.5.0 are read, said so, and not used; a flow is never written with variant", () => {
    const block = parseFlowText("@builder\n1. a\n   - x [variant, P1]\n   - y");
    assert.equal(block.warnings.length, 1);
    assert.match(block.warnings[0], /^Line 3: "variant" was removed \(EP mode is gone, version 0\.6\.0\); it is ignored, delete it$/);
    assert.equal(block.flow.steps[0].conds.length, 2);
    assert.equal(block.flow.steps[0].conds[0].pri, "1", "the other options on the line still count");
    assert.ok(!formatFlow(block.flow).includes("variant"), "written back without it");

    const compact = parseFlowText("a (x [variant] | y)");
    assert.equal(compact.warnings.length, 1);
    assert.match(compact.warnings[0], /"variant" was removed/);
    assert.equal(compact.flow.steps[0].conds.length, 2);

    const ep = parseFlowText("@ep a (x | y)");
    assert.equal(ep.mode, null, "no mode of its own: the panel's switch decides");
    assert.equal(ep.flow.steps.length, 1, "the @ep word is not a step");
    assert.equal(ep.flow.steps[0].name, "a");
    assert.match(ep.warnings.join("\n"), /@ep is not used \(EP mode was removed, version 0\.6\.0\); pick the mode in the panel/);
    // the modes that stay are still read
    assert.equal(parseFlowText("@pair a (x | y)").mode, "pair");
    assert.deepEqual(parseFlowText("@all a (x | y)").warnings, []);
});

test("CALC-39: there is no EP: the default is Pairwise, and a mode that is not All or Each picks what Pairwise picks", () => {
    const flow = parseFlowText("@builder\n1. a\n   - x\n   - y\n2. b\n   - p\n   - q\n   - r").flow;
    const g = generate(flow);
    const ids = (m: string) => pick(g, m as any).map((sc) => sc.id);
    assert.deepEqual(ids("ep"), ids("pair"));
    assert.deepEqual(ids("anything"), ids("pair"));
    assert.notDeepEqual(ids("min"), ids("pair"));
    assert.equal(ids("all").length, 6);
});
