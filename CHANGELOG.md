# Changelog

## Unreleased

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
