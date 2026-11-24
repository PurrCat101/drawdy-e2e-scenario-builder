# Changelog

## Unreleased

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
