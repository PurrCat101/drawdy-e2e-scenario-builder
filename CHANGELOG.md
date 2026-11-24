# Changelog

## Unreleased

- Property-based tests (fast-check, `test/property.test.ts`). They found two small
  bugs, both fixed:
  - A choice named like options, such as `Pay [visa]`, lost its name when the flow was
    written back with `formatFlow` and read again. `formatFlow` now adds an empty `[]`.
  - Pairwise picked no scenario for a flow without choices (EP and Each picked one).
    All modes now pick at least one scenario when the flow has a path (CALC-83).

## 0.2.0

- The driver's `src/index.ts` (934 lines) is split into `host`, `webview`,
  `panelMessages`, `actions`, `drawing` and `selection`. No behaviour change.

### Read this before upgrading

- **Scenario IDs look different.** They come from the path itself (`TSS-04821`), not
  from walk order (`TSS-001`), so they no longer move when the flow changes elsewhere.
  IDs kept from 0.1.0 do not match the new ones. Old notes still read.
- **Priority** is now the most important `P` on a path (the lowest number): a path
  with a P1 choice is P1. 0.1.0 took the largest number.
- **"Cases" are "scenarios"** everywhere: buttons **Scenarios** and **Flow +
  Scenarios**, the table's first column, frame names, status lines.
- Counts can grow a little: every mode now also covers each loop at its full `max`
  (the sample flow's EP goes from 28 to 29).

### Added

- Starter notes: Basic, Loop and Levels drop a ready-made `@builder` note on the
  board, with the syntax explained in `#` comments, so a flow is written on the board
  instead of in the small panel.
- The panel shows the counts, flow check and a mode tip of the flow note selected on
  the board, updated once the text holds still while you type.
- `distinct` on `loop to step N`: the next round offers only the choices not taken
  yet at that step, and rounds that differ only in order count once (3 items: 6 pick
  sets instead of 12). The flow check warns when it does nothing or `max` asks for
  more rounds than there are choices.
- Past 1,000 paths, a targeted search adds a path for each choice, loop end and pair
  the first 1,000 missed, so every mode still covers them. The flow check tells a
  choice that can never be taken apart from one the search ran out of time for.
- The scenario frame header says `OK: every choice … is covered` or names what is
  missing, counts loop ends, lists unreachable choices, and traces each `req:` to the
  scenarios that pass it. The panel shows an ERROR if a mode ever misses what it
  promises.
- A TIP line in the panel and the frame header suggests a mode for the flow.
- A Happy scenario that passes a `[negative]` choice says `via negative` in its title.
- `specs/`: the source of truth for what the extension does, one file per area, with
  rule IDs that tests name; `test/specs.test.ts` keeps them consistent. `CLAUDE.md`
  says how to keep specs and code together.
- GitHub Actions runs the checks on every push and pull request.

### Changed

- Faster: a flow already worked out is remembered (in memory, last 8 flows), so a
  button after the panel counted it does not count again; the live counts use a short
  search budget and run the coverage safety net only up to 300 scenarios; Pairwise is
  about 8 times faster with the same picks. The panel shows "counted in … s" for a slow
  count.
- The panel is more compact (the paste box folds away, the status sits under the
  buttons); issues are one line each, coloured by kind, the first two shown and the rest
  under "N more"; the "a lot of scenarios" line suggests only modes that draw fewer.
- Internal names say "scenario" too (`scenarioTable.ts`, `scenarioFlow.ts`). Tables
  now store `scenarios`; tables from 0.1.0 store `cases`, which is still read.
- Each is described as a small set, not "the fewest": Each and Pairwise are greedy,
  complete but not always minimal.

### Fixed

- Scenarios on a selected scenario frame drew nothing (a hint note appeared and the
  status said "Done"); it now draws a new scenario frame in the chosen mode.
- Choices the walk never reached past 1,000 paths were in no mode at all, and the flow
  check called them a conflict.
- EP's "stands for N similar" marks could leak into other modes' notes.

### Docs and tests

- README: "How the scenarios are counted" (a flow counted by hand, with a diagram),
  "What each mode guarantees" and the math, "Scenario IDs", "Writing a flow that tests
  well", and a Terms table (Flow, Scenario, Test case).
- Tests: the generator is checked against an independent enumerator on random flows,
  including flows past the limit; the mode guarantees, the `distinct` formula and the
  lower bounds are tested; 84 tests in all.

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
