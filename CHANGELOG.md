# Changelog

## Unreleased

- Fix: Scenarios on a selected scenario frame drew nothing (a hint note appeared and
  the status said "Done"). It now draws a new scenario frame in the chosen mode from
  the flow stored on the frame, as the panel promised.
- `specs/`: the source of truth for what the extension does, one file per area
  (glossary, panel, driver, calculation, syntax, board output, testing), with rule IDs
  that tests name. `test/specs.test.ts` keeps the IDs unique and every named rule
  defined. `CLAUDE.md` says how to keep specs and code together.
- Faster in Drawdy: a flow already worked out is remembered (in memory, last 8 flows),
  so pressing a button after the panel counted it does not count again. While a flow
  note is typed in, the panel counts it when the text holds still, not on every poll,
  with a short search budget past 1,000 paths and the coverage safety net only up to
  300 scenarios; a button runs the full search. Pairwise picks the same scenarios as
  before, about 8 times faster. The panel shows "counted in … s" for a slow count.
- Past 1,000 paths, every mode still covers every choice and every pair that can
  happen: a targeted search adds a path for each one the first 1,000 missed. Before,
  those choices were in no mode at all. The flow check now tells a choice that can
  never be taken apart from one the search ran out of time for.
- Every mode covers each loop (max 2 or more) at its full max, the last round it
  allows. The sample flow's EP goes from 28 to 29.
- The scenario frame header says `OK: every choice … is covered` or names what is
  missing, counts loop ends, lists unreachable choices, and traces each `req:` to the
  scenarios that pass it. The panel shows an ERROR if a mode ever misses what it
  promises.
- Stable scenario IDs: the number comes from the steps and choices the scenario
  passes (`TSS-04821`), so it no longer moves when the flow changes elsewhere.
- A TIP line in the panel and the frame header suggests a mode for the flow.
- The panel shows the counts of the flow note selected on the board.
- `distinct` option for `loop to step N`: the next round offers only the choices
  not taken yet at the step it goes back to, and rounds that differ only in order
  count once. An "add another item" loop over 3 items gives 6 pick sets instead of
  12 (3 + 3×3). The panel warns when `distinct` does nothing or `max` asks for more
  rounds than there are choices.
- A Happy scenario that passes a `[negative]` choice (a retry that then succeeds)
  says `via negative` in its title.
- README: "How the scenarios are counted", a 3-step flow counted by hand with a
  diagram, a backwards check anyone can repeat, and what each part of the syntax
  does to the count. A test keeps the examples and every number on the diagram in
  step with the generator.
- README: "What each mode guarantees" and the math behind it: what Each, Pairwise
  and EP cover and do not (never every path, and not the last round of a loop), why
  greedy is complete but not minimal, the `distinct` formula, and two lower bounds to
  check a size by hand. The Each mode is no longer described as "the fewest".
- Tests: the path generator is checked against a second, independent enumerator on
  1,500 random flows (same paths, none twice, same Happy/Negative split), EP / Pair
  / Each are checked to keep every choice and pair, and `distinct` against its
  closed form.
- README: a "Writing a flow that tests well" section on test data across steps,
  one outcome per step, impossible paths, `distinct` and loop defaults.
- Starter notes: the Basic, Loop and Levels buttons drop a ready-made `@builder`
  note on the board, with the syntax explained in `#` comments, so a flow is
  written on the board instead of in the small panel.
- One word for one thing: what the panel, the board and the README called "cases"
  are now always "scenarios" (buttons **Scenarios** and **Flow + Scenarios**,
  the table's first column, frame names, status lines). Boards drawn before keep
  working: the stored keys are unchanged.
- The panel is more compact: the paste box is folded away, and the status line sits
  right under the buttons.

## 0.1.0

- New readable text syntax: a note that starts with `@builder`, numbered steps,
  `-` conditions, `given:` / `data:` / `then:` / `req:` fields (the older `setup:` and
  `expect:` are still read), `-> end`,
  `-> loop`, `-> loop to step N`, options `[P1, variant, negative, sets x, needs a or b]`.
  The one-line form (`a (ok | !fail) > b`) still works.
- Only notes that start with `@builder` are read from the board.
- Reading problems are shown with their line while typing.
- One parser (`src/syntax.ts`) shared by the panel and the board actions.
- No limit on the number of scenario notes; many cases use more columns.

- Panel with a text box, mode switch and live scenario counts.
- Draw a flow diagram and its test scenarios (EP, all paths, pairwise,
  each-choice) on the board from a text syntax.
- Scenario notes show test data and expected results typed in the notes.
- Case tables (step, condition, setup, test data, expected) with copy buttons.
