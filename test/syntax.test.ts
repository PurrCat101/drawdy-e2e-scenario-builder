// Tests for the text syntax. Run: npm test
//
// The sample flow is a shop checkout with the same structure as a real, large
// flow (12 steps, loops, negative ends, tags and `need` rules). Written in both
// forms it must give the same flow, and the scenario counts must stay
// All 231 / EP 28 / Pairwise 17 / Each-Choice 11.

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFlow, hasMarker, needFromWords, needToWords, parseFlowText } from "../src/syntax.ts";
import { generate, pick } from "../src/scenarios.ts";
import type { Flow } from "../src/flow.ts";
import { renderScenarios } from "../src/scenarioBoard.ts";
import { TEMPLATES, templateById } from "../src/templates.ts";
import { validate } from "../src/scenarios.ts";

const COMPACT = [
    "Open the shop and sign in (Sign in ok [P1] | !Sign in failed [P2]) >",
    "Check the account (Verified level 1 [tag=lv1 variant P1] | Verified level 2 [tag=lv2 variant P1] | !Not verified [P1] | !Under review [P2]) >",
    "Pick from the catalog (Pick a creature [variant] | Pick a normal item [variant] | Pick a premium item [variant tag=premium P1]) >",
    "Add to bag >",
    "Buy more? (~3 Pick more [P2 variant] | Done shopping) >",
    "Open the bag and check out >",
    "Purchase rules API (All rules pass [need=!premium/lv2 P1] | !Level required [need=premium,lv1 P1] | !Service down 503 [P2] | !Out of stock [need=!premium/lv2 P2] | !Not enough funds [need=!premium/lv2 P1]) >",
    "Save purchase and shipment pending >",
    "Shipping worker creates label (Got tracking number [P1] | -~9 Provider down retry [P2 variant max=2] | !Retries used up [P2]) >",
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
   - Verified level 1 [P1, variant, sets lv1]
   - Verified level 2 [P1, variant, sets lv2]
   - Not verified -> end [P1]
   - Under review -> end [P2]
3. Pick from the catalog
   - Pick a creature [variant]
   - Pick a normal item [variant]
   - Pick a premium item [P1, variant, sets premium]
4. Add to bag
5. Buy more?
   - Pick more -> loop to step 3 [P2, variant]
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
   - Provider down retry -> loop max 2 [P2, variant, negative]
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
            variant: c.variant,
        })),
    }));

const counts = (flow: Flow) => {
    const all = generate(flow).list.length;
    return {
        all,
        ep: pick(generate(flow), "ep").length,
        pair: pick(generate(flow), "pair").length,
        min: pick(generate(flow), "min").length,
    };
};

test("the sample flow gives the same counts in both forms", () => {
    const want = { all: 231, ep: 28, pair: 17, min: 11 };
    const compact = parseFlowText(COMPACT);
    const blocks = parseFlowText(BLOCKS);
    assert.equal(compact.format, "compact");
    assert.equal(blocks.format, "blocks");
    assert.deepEqual(compact.warnings, []);
    assert.deepEqual(blocks.warnings, []);
    assert.deepEqual(counts(compact.flow), want);
    assert.deepEqual(counts(blocks.flow), want);
});

test("both forms describe the same flow", () => {
    assert.deepEqual(shape(parseFlowText(BLOCKS).flow), shape(parseFlowText(COMPACT).flow));
});

test("without any option the counts are what the plain text gives", () => {
    const plain = COMPACT.replace(/ ?\[[^\]]*\]/g, "");
    const c = counts(parseFlowText(plain).flow);
    assert.deepEqual(c, { all: 243, ep: 183, pair: 17, min: 11 });
});

test("only a note that starts with @builder is marked", () => {
    assert.equal(hasMarker("@builder\n1. a"), true);
    assert.equal(hasMarker("\n# a comment\n  @BUILDER\n1. a"), true);
    assert.equal(hasMarker("1. a\n- b"), false);
    assert.equal(hasMarker("Login (ok | !fail) > Pay"), false);
    assert.equal(parseFlowText("@builder\nLogin (ok | !fail) > Pay").marked, true);
    assert.equal(parseFlowText("Login (ok | !fail) > Pay").marked, false);
});

test("compact form after the marker, and the title", () => {
    const r = parseFlowText("@builder\n@title Quick\nLogin (ok | !fail) > Pay");
    assert.equal(r.format, "compact");
    assert.equal(r.title, "Quick");
    assert.equal(r.flow.steps.length, 2);
    assert.equal(r.flow.steps[0].conds[1].action, "end");
});

test("keywords: end, loop, loop to step N, next (any case), max N; back and x2 still work", () => {
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

test("fields belong to the step before its first condition, then to the last condition", () => {
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

test("a value can continue on the next lines; \\ keeps a line that looks like structure", () => {
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

test("comments and blank lines are ignored", () => {
    const r = parseFlowText("@builder\n# note\n// another\n\n1. a\n\n   - b\n");
    assert.deepEqual(r.warnings, []);
    assert.equal(r.flow.steps[0].conds.length, 1);
});

test("mistakes are reported with their line", () => {
    const r = parseFlowText(`@builder
@mod pair
1. a
   datta: x
   - ok [varient]
   - bad -> loop to step 9
   - odd -> loop to step
5. b
   - more -> loop max
`);
    const w = r.warnings.join("\n");
    assert.match(w, /Line 2: Unknown directive @mod/);
    assert.match(w, /Line 4: Unknown field "datta:" \(did you mean data:\?\)/);
    assert.match(w, /Line 5: Unknown option "varient" in \[ \] \(did you mean variant\?\)/);
    assert.match(w, /Line 6: There is no step 9 to loop to/);
    assert.match(w, /Line 7: Give the step number/);
    assert.match(w, /Line 9: Cannot read the end of the line/);
});

test("@mode is no longer a directive: the mode is chosen in the window", () => {
    const r = parseFlowText("@builder\n@mode pair\n@ep\n1. a");
    assert.equal(r.warnings.length, 2);
    assert.match(r.warnings[0], /@mode is not used/);
    assert.match(r.warnings[1], /@ep is not used/);
});

test("step numbers: duplicates and gaps", () => {
    const r = parseFlowText("@builder\n1. a\n1. b\n3. c\n2. d");
    const w = r.warnings.join("\n");
    assert.match(w, /Step number 1 is repeated/);
    assert.match(w, /Step number 2 is out of order/);
    // a gap alone is fine: loops refer to the number that was written
    const g = parseFlowText("@builder\n1. a\n5. b\n   - again -> loop to step 5 max 2\n");
    assert.deepEqual(g.warnings, []);
    assert.equal(g.flow.steps[1].conds[0].target, g.flow.steps[1].id);
});

test("compact form: unknown options are reported", () => {
    const r = parseFlowText("a (ok [varient] | !bad)");
    assert.match(r.warnings.join("\n"), /unknown option "varient"/);
});

test("need in words and back", () => {
    assert.equal(needFromWords("!master or lv2"), "!master|lv2");
    assert.equal(needFromWords("master and lv1"), "master,lv1");
    assert.equal(needFromWords("not a and b or not c"), "!a,b|!c");
    assert.equal(needToWords("!a,b|!c"), "!a and b or !c");
});

test("writing the flow back and reading it again gives the same flow", () => {
    const first = parseFlowText(BLOCKS);
    const text = formatFlow(first.flow, { title: first.title });
    const again = parseFlowText(text);
    assert.deepEqual(again.warnings, []);
    assert.deepEqual(shape(again.flow), shape(first.flow));
    assert.equal(again.title, "Shop checkout");
    assert.deepEqual(counts(again.flow), { all: 231, ep: 28, pair: 17, min: 11 });
    // and writing it twice changes nothing
    assert.equal(formatFlow(again.flow, { title: again.title }), text);
});

test("the compact form is written out in the blocks form", () => {
    const flow = parseFlowText(COMPACT).flow;
    const back = parseFlowText(formatFlow(flow));
    assert.deepEqual(shape(back.flow), shape(flow));
});

test("fields survive writing, including lines that look like structure", () => {
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

test("an empty or step-less text says so", () => {
    assert.match(parseFlowText("@builder\n- orphan").warnings.join("\n"), /must be under a step/);
    assert.equal(parseFlowText("").flow.steps.length, 0);
});

test("a scenario note is written in the flow syntax and reads back as that scenario", () => {
    const flow = parseFlowText(BLOCKS).flow;
    const gen = generate(flow);
    const shown = pick(gen, "ep");
    const out = renderScenarios({
        flow,
        mode: "ep",
        shown,
        gen,
        counts: { all: 231, ep: 28, pair: 17, min: 11 },
        issues: [],
        origin: [0, 0],
        generateId: (() => {
            let n = 0;
            return () => "e" + ++n;
        })(),
    });
    const notes = out.elements.filter((e: any) => e.meta?.kind === "scenario") as any[];
    assert.equal(notes.length, 28);
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

test("scenario notes carry setup, data and expected result, and the table rows match", async () => {
    const { scenarioRows } = await import("../src/scenarioTable.ts");
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
        counts: { all: 2, ep: 2, pair: 2, min: 2 },
        issues: [],
        origin: [0, 0],
        generateId: (() => {
            let n = 0;
            return () => "e" + ++n;
        })(),
    });
    const notes = out.elements.filter((e: any) => e.meta?.kind === "scenario") as any[];
    const happy = notes.find((n) => n.meta.type === "happy");
    for (const w of ["given: stack is up", "data: user a", "data: good password", "then: token stored", "then: receipt"])
        assert.ok(happy.text.includes(w), w);
    // the note reads back, and its table has the same cells
    const back = parseFlowText(happy.text);
    assert.deepEqual(back.warnings, []);
    const rows = scenarioRows(back.flow);
    assert.equal(rows[0].data, "user a\ngood password");
    assert.equal(rows[0].exp, "dialog opens\ntoken stored");
    assert.equal(rows[0].pre, "stack is up");
});

test("given / then are the field names; setup / expect are still read", () => {
    const a = parseFlowText("@builder\n1. a\n   given: g\n   then: t\n   - ok\n");
    const b = parseFlowText("@builder\n1. a\n   setup: g\n   expect: t\n   - ok\n");
    assert.deepEqual(a.warnings, []);
    assert.deepEqual(b.warnings, []);
    assert.equal(a.flow.steps[0].pre, "g");
    assert.equal(a.flow.steps[0].exp, "t");
    assert.equal(b.flow.steps[0].pre, "g");
    assert.equal(b.flow.steps[0].exp, "t");
    const out = formatFlow(b.flow);
    assert.ok(out.includes("   given: g") && out.includes("   then: t"));
    assert.ok(!out.includes("setup:") && !out.includes("expect:"));
    // a typo is pointed at the new name
    assert.match(parseFlowText("@builder\n1. a\n   gven: x\n").warnings.join(""), /given:/);
});

test("scenarios as tab-separated text for a spreadsheet", async () => {
    const { scenariosToTsv } = await import("../src/scenarioTable.ts");
    const flow = parseFlowText("@builder\n1. Login\n   given: g\n   data: line one\n   line two\n   then: t\n   - ok\n").flow;
    const tsv = scenariosToTsv([{ title: "TSS-001 · Happy · P1   ok", flow }]);
    const lines = tsv.split("\n");
    assert.equal(lines[0], "Scenario\t#\tStep\tCondition\tSetup\tTest data\tExpected result");
    // a cell with two lines is quoted, so a spreadsheet keeps it in one cell
    assert.equal(lines[1], 'TSS-001 · Happy · P1\t1\t1. Login\tok\tg\t"line one\nline two"'.split("\n")[0]);
    assert.ok(tsv.includes('"line one\nline two"\tt'));
});

test("starter templates: marked, read without warnings, make scenarios, no flow errors", () => {
    assert.deepEqual(TEMPLATES.map((t) => t.id), ["basic", "loop", "levels"]);
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

test("starter templates: the comments do not change the flow", () => {
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

test("distinct loop: no choice twice, and a set of picks only once whatever the order", () => {
    // plain loop: 3 + 3*3 + 3*3*3 ordered picks, repeats included
    assert.equal(picks(SHOP("")).length, 3 + 9 + 27);
    const d = picks(SHOP(" [distinct]"));
    // distinct: subsets of {A,B,C} of size 1..3 = 3 + 3 + 1
    assert.deepEqual([...d].sort(), ["A", "A+B", "A+B+C", "A+C", "B", "B+C", "C"]);
});

test("distinct loop: an end at the step it goes back to stays available every round", () => {
    const flow = parseFlowText(SHOP(" [distinct]")).flow;
    const ends = generate(flow).list.filter(
        (s) => s.type === "neg" && s.path[s.path.length - 1].c!.label === "sold out"
    );
    // sold out on round 1, after 1 pick (3 ways), after 2 picks (3 ways)
    assert.equal(ends.length, 1 + 3 + 3);
});

test("distinct: read, written back, and warned about when not on a loop", () => {
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

test("distinct holds back only the step it goes back to, not the steps after it", () => {
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

test("distinct with needs: a set is kept even when only one order is allowed", () => {
    const t = "1. pick\n- A [needs c]\n- B\n- C [sets c]\n2. more\n- again -> loop to step 1 [distinct]\n- done";
    // A needs C first, so {A, C} only exists as C then A; it must not be lost
    assert.deepEqual(rounds(t, [0]), ["B", "B+C", "C", "C+A"]);
});

test("distinct ends with the run: a later plain loop back to the same step picks freely", () => {
    const t =
        "1. pick\n- A\n- B\n2. more\n- again -> loop to step 1 [distinct]\n- done\n3. retry\n- redo -> loop to step 1\n- ok";
    const r = rounds(t, [0]);
    assert.ok(r.includes("A+B+A") && r.includes("A+B+B"), r.join(", "));
});

test("validate warns when distinct does nothing or asks for more rounds than choices", () => {
    const issues = (t: string) => {
        const f = parseFlowText(t).flow;
        return validate(f, generate(f)).filter((i) => /distinct|different picks/.test(i.msg)).map((i) => i.msg);
    };
    assert.deepEqual(issues("1. a\n- A\n- B\n2. b\n- again -> loop to step 1 [distinct]\n- done"), []);
    assert.match(issues("1. a\n- A\n- B\n2. b\n- again -> loop to step 1 max 2 [distinct]\n- done")[0], /3 different picks at step 1, which has 2/);
    assert.match(issues("1. a\n2. b\n- again -> loop to step 1 [distinct]\n- done")[0], /step 1 has no choices/);
    assert.match(issues("1. a\n- retry -> loop max 2 [distinct]\n- ok")[0], /earlier step/);
});

test("a happy scenario that passes a [negative] choice says so in its title", () => {
    const t = "1. ship\n- ok\n- provider down -> loop max 1 [negative]\n2. done\n- delivered";
    const gen = generate(parseFlowText(t).flow);
    let n = 0;
    const out = renderScenarios({
        flow: parseFlowText(t).flow,
        mode: "all",
        shown: gen.list,
        gen,
        counts: { all: gen.list.length, ep: 0, pair: 0, min: 0 },
        issues: [],
        origin: [0, 0],
        generateId: () => "e" + ++n,
    });
    const titles = (out.elements as any[]).filter((e: any) => typeof e.text === "string" && /TS[SN]-\d+/.test(e.text))
        .map((e: any) => e.text.split("\n").find((l: string) => /TS[SN]-/.test(l)));
    assert.equal(titles.filter((x: string) => /via negative/.test(x)).length, 1, titles.join(" / "));
    assert.ok(titles.some((x: string) => /Happy/.test(x) && !/via negative/.test(x)));
});
