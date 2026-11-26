# 06 · Testing

How the specs are checked. Run everything with `npm test` (no browser, no extra
packages).

## Test files

- **TEST-01** `test/syntax.test.ts`: the syntax (04), the calculation on fixed flows
  (03), scenario notes, tables and the copy text (05), the README examples.
- **TEST-02** `test/driver.test.ts`: the driver against a fake Drawdy host (an
  in-memory scene) and the panel page against a stub DOM: every button for every kind
  of selection (02, 01), messages, placement, terminology (UI-20, UI-21), caching
  (CALC-80).
- **TEST-03** `test/oracle.test.ts`: the calculation against a second, independent
  enumerator on random flows (CALC-01 … CALC-23), mode guarantees (CALC-30, CALC-36),
  the formulas (CALC-12, CALC-17, CALC-38).
- **TEST-04** `test/specs.test.ts`: rule IDs are unique across the specs, every rule ID
  a test names exists, and the spec index lists every spec file.
- **TEST-31** `test/decision.test.ts`: the decision table (CALC-90 to 94, OUT-60 to 64) on fixed flows;
  `test/property.test.ts` checks it on flows made by fast-check.
- **TEST-05** `npm test` lists the test files explicitly (`package.json`): a new test
  file must be added there.

- **TEST-06** GitHub Actions (`.github/workflows/test.yml`) runs on every push and pull
  request: `npm ci`, checks that `src/panelHtml.ts` matches `editor/panel.html`,
  typecheck, `npm test`, build, and keeps the built `.drawdyx` as an artifact.

- **TEST-07** `npm run spec:coverage` lists the rules no test names yet. It is a
  report, not a gate: some rules (layout, wording, the look in Drawdy) are checked by
  hand (TEST-30).

## The independent enumerator

- **TEST-10** The enumerator in `test/oracle.test.ts` shares no code with
  `src/scenarios.ts`: an explicit stack, its own reading of `sets`/`needs`. It catches
  slips in the implementation; it cannot tell whether a rule is the one you meant —
  that is what the specs are for.
- **TEST-11** Random flows are seeded, so a failure can be reproduced from its seed.
- **TEST-12** `test/property.test.ts` states rules that hold for every flow (reading
  back what `formatFlow` wrote, IDs, what each mode may pick, the coverage each mode
  promises, the loop limit `max` and the rounds of a `distinct` loop, the remembered analysis)
  and lets fast-check make the flows. A failing property is shrunk to the smallest
  flow that still fails and printed with its seed; that flow is then kept as a plain
  example in the same file. `PBT_RUNS` sets the runs per property (default 300; use
  5000 or more before a release). Labels are generated with `[`, `]` and `\` in them.

- **TEST-13** `test/golden.test.ts` keeps a snapshot (`test/golden/pipeline.json`) of what the
  whole pipeline gives for a few fixed flows (a loop flow, a quantity flow with `variant`,
  the template): for each mode the scenarios and their IDs, the coverage and requirement
  lines, the copied test steps and decision table, and every element the board drawing
  sends to Drawdy, as short fingerprints, with the counts and IDs in full. A change that
  moves code without changing behaviour (the split into `src/core` and the Drawdy side)
  must leave the snapshot as it is. A change on purpose is written with `GOLDEN_UPDATE=1`
  and its diff is read like any other change.

## Mutation checks

- **TEST-20** A new test for a calculation rule is checked once by breaking the code
  on purpose (an off-by-one, a skipped rule) and seeing the test fail, then restoring.
- **TEST-21** A change meant to keep results the same (a speed-up) is compared
  against the previous version on many random flows: same scenarios, same order.

## By hand in Drawdy

- **TEST-30** Before a release, the README's manual check (about five minutes): what
  the tests cannot see — how things look, what Drawdy itself does, and whether Drawdy
  stays responsive with a big flow (the thread the driver runs on is not documented).
