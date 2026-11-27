# Changelog

## 0.7.0

### Read this before upgrading

- **Pair and Each always include the base path** (a Happy scenario with the fewest
  loops, usually the plain way through the flow), and they **drop scenarios the others
  already cover**. So the number of scenarios and the IDs of Pair and Each can change
  for the same text: regenerate before you trust an ID from an earlier board
  (CALC-28, CALC-29, CALC-56).
- **What does not change:** All, the syntax, the test steps of a given scenario and
  what each mode promised before (every choice, loop end and, for Pair, every pair).

### Changed

- **Base path.** A flow with an "add another product" loop could get a Pair set where
  every scenario went round the loop, so the plain one-product order was never tested.
  Pair and Each now count the base path as one more item to cover (CALC-28, TERM-16).
- **Pruning.** After the greedy picks, a scenario is dropped when the other picked
  scenarios already cover everything it covers (CALC-29). Each could pick a Happy path
  without loops first and then a looping Happy path that took the same choices too, so
  it picked more than Pair on a small flow.
- Pairwise and Each are still greedy, not the smallest possible set (CALC-35).
- **The panel fits its window.** The buttons are all in view: the target line and the
  mode switch (each button with its count) stay at the top, Place and the status at the
  bottom. Each table has its **Copy** button beside it, the steps list can be copied
  without drawing it, **Write flow** opens the text box over the buttons, and the
  warnings fold under one line (UI-15, DRV-63).
- The **Place automatically** and **Cancel** buttons are gone. While a drawing waits for
  your click, choose **Auto** to place it, or press Esc (on the board or in the panel).
- Fixed: after copying the test steps the "Copied …" line was cleared at once.
- **The decision table shows every step.** It used to leave out steps with fewer than
  two choices, so a table could start at step 5. A step without choices now has an
  no box under Combinations and an X in each scenario that passes it (CALC-90, CALC-92).
  A flow with nothing to decide is drawn and copied too, with a warning (CALC-94).
- **Copied notes are read as they are now.** A copy keeps the data of its original, so
  an edited copy, or one moved into another frame, could give the old scenario. The
  stored data is now used only while it matches the note; otherwise the text is read
  (DRV-62). Such a note is a flow note: **Flow** draws only its flow, without a test
  steps table (DRV-55).

## 0.6.0

### Read this before upgrading

- **EP mode is gone, and Pair is the default.** The modes are All, Pair and Each. EP
  grouped only choices marked `[variant]`, and then added back every choice it had
  dropped, so it removed little (a flow without `variant` got almost what All gives)
  and its name promised more than it did. For a range of values (age 18 to 60) write
  the few values you want to test, the usual way: a boundary and one value from inside.
  A text that still has `[variant]` or `@ep` reads, says so in a warning, and does not
  use them; delete them. A board frame drawn in EP keeps working: it follows the
  panel's switch (CALC-39, SYN-22).
- **What does not change:** the scenarios, IDs, test steps and decision table of All,
  Pair and Each are the same as in 0.5.0 for the same text (the golden snapshot shows
  it; only the data kept inside board frames lost the `variant` and `covers` fields).

### Removed

- The EP mode, its count in the panel and in the frame header (`All a · Pairwise c ·
  Each-Choice d`), its `# also stands for N similar` line in a scenario note, and the
  `variant` option. Rules CALC-31 and CALC-32 are marked removed.

### Changed

- The starter template no longer has `[variant]` on its two products.

## 0.5.0

### Read this before upgrading

- **You choose where results go.** A new **Place** switch: **By hand** (now the
  default) holds what a button draws as an outline that follows the pointer; click the
  board to put it down, press Esc to cancel. The camera no longer moves. **Auto** is
  the earlier behaviour: free space, then fly there (DRV-70 to DRV-76, UI-60, UI-61).

### Changed

- **The panel says what each mode picks**, under the mode switch. For EP: it groups
  paths that differ only in `[variant]` choices, and still uses every choice (UI-47).
- **Flows too big to list are marked as such.** The All count reads `N+`, EP says
  `(partial)`, one line explains it before the other warnings, and the scenario frame
  header says `listed paths (the flow has more)` instead of `paths` (UI-46, OUT-21).
- **The `TIP:` line is gone** from the panel and from the scenario frame header; it
  took room and the line under the mode switch says what each mode picks.

### Fixed

- **A `distinct` loop could list far fewer paths than there are.** Rounds in another
  order counted toward the limit of 1,000 before they were merged, so a flow with 255
  different paths listed 59. Only different paths count now; the walk stops after
  200,000 walked paths, and the flow check then says how many it found (CALC-24).
- **The starter template raised a flow check warning.** Its loop asked for `max 2`
  different products where the step has two; it is `max 1` now. The scenarios are the
  same, and the diagram says `up to 1 time`.

## 0.4.0

- **New button: Steps list** (under Tables). Draws every step and every choice of the whole
  flow as one table, with the usual columns and a **Req** column (the requirement IDs of the
  step and of the choice). Not scenarios: it does not depend on the mode and has no limit on
  size. Select the table and press **Copy to clipboard** to paste it into a spreadsheet (the
  status says "Copied N steps"). The other buttons work as before (DRV-61, OUT-67).
- Internal, nothing changes for users: the code that reads the syntax, works out scenarios
  and makes the texts and tables moved to `src/core/`, apart from Drawdy, so a web page can
  use it (`npm run build:core`). A snapshot test (TEST-13) shows that scenarios, IDs, copied
  text and the elements drawn on the board are the same as before.

## 0.3.0

### Read this before upgrading

- **The buttons have new names and groups.** **Table** is now **Test steps** (and **Flow +
  Table** is **Flow + Test steps**), **Copy table** is **Copy to clipboard**, and the
  buttons sit under the headings **Draw**, **Tables** and **Export**. Their labels end
  with how many scenarios they use (`Test steps · 28 scenarios`) instead of a long
  sentence. The frame the Test steps button draws is named `Test steps · …`, not `Test
  sequence · …`. In the README a row of that table is a **test step** (it was a "test
  case", which most people use for what we call a scenario).
- **Scenario IDs are running numbers again.** Happy scenarios are `TSS-001`,
  `TSS-002`... and Negative ones `TSN-001`, `TSN-002`..., counted in the order the board
  lists them, instead of the five-digit hash (`TSS-04821`) of 0.2.0. The same flow always
  gives the same IDs, but a flow that gains or loses a scenario moves the IDs after it, so
  check an ID you kept in a ticket after you regenerate. IDs from the hash still read on
  old boards (CALC-50, 55, 56; CALC-51 to 53 are removed).
- **Each mode numbers its own scenarios.** EP, Pair and Each count from `001` over what
  they pick, so 3 Happy and 2 Negative scenarios end at `TSS-003` and `TSN-002`. The same
  scenario can have another ID in another mode (CALC-57).
- **`setup:` and `expect:` are the field names; `given:` and `then:` still work.** The two
  are Gherkin's words, but the syntax is not Gherkin (no `When`, no `And`), so the
  fields are named for what they hold and for the columns of the Test steps table.
  Notes you wrote with `given:` / `then:` read exactly as before, and you can keep typing
  them. What the extension writes back, and the starter template, use `setup:` and
  `expect:`, so a note read and written back by the extension changes its spelling. A
  field written twice, under either name, keeps both texts. The README has a new
  Fields section (SYN-19).
- **One starter note.** The Basic, Loop and Levels buttons are replaced by one **Start
  with a template** button: an online-shop checkout (log in or guest, products in a
  loop, shipping, payment) that uses every piece of the syntax.
- **Notes the extension draws are text boxes, not sticky notes.** The starter note, the
  header and scenario notes, hints and errors are filled rectangles with black text,
  each as tall as its text needs (OUT-50). A flow note you write yourself can still be a
  sticky note, a text box or plain text: all are read.
- **The flow diagram uses plain words only**, so it can be shown to people who do not
  know the syntax: a loop is labelled `up to 2 times` instead of `≤2 · distinct`
  (OUT-10), and a choice's label stays on one line, with the arrow made long enough for
  it, instead of wrapping into a narrow box (OUT-12).

### Added

- **Decision table** button: the decision table of the scenarios of the chosen mode. The
  steps that decide (two or more choices) are the rows, each scenario is a column headed
  by its scenario ID (`TSS-001`, `TSN-001`) under a **Success** (Happy) or **Negative**
  bar, an X marks the choices a scenario takes. It is drawn as ordinary boxes, so it
  can be edited on the board, ten scenarios to a frame (named `Scenarios 1 to 10 of N`)
  and at most 60. **Copy to clipboard** copies a selected decision table for a
  spreadsheet, with the scenario IDs as its head row (CALC-90 to 94, OUT-60 to 64,
  DRV-57).
- **Copy decision table** button (Export): copies the decision table as text for a spreadsheet,
  without drawing it and without the limit of 60 scenarios, one long row of scenarios so
  the first two columns can be frozen (DRV-58). **Decision table** still draws at most 60.
- A decision table column is found on the board by the ID on the scenario note: column k
  and note k of the same mode are the same scenario with the same ID, and selecting that
  note gives its Flow and Test steps (OUT-65).
- **A decision table's column heads trace back.** Select a head (`TSS-001`) and press
  **Flow**, **Test steps**, **Copy to clipboard** or **Decision table**: it works like a
  scenario note. The table keeps the flow and the mode it was made from, and each head
  keeps its path, so it goes back to the right scenario even after the note is edited or
  when two tables were drawn, and although an ID counts within one mode (OUT-66, DRV-59).
- **Flow only.** With a scenario note or a decision table's column head selected, the
  **Flow + Scenarios** button, which had nothing to draw there and was greyed out, now reads
  **Flow only** and draws just the flow of the selected scenario, without its test steps.
  **Flow** keeps reading **Flow + Test steps** (UI-34, DRV-60).
- **`needs:` and `sets:` lines under a choice.** A rule such as `needs: user and lv1 or
  premium` is now a line of its own instead of the end of the choice's line, so the
  label stays easy to read. The bracket spelling (`[needs user, sets cod]`) still works
  and gives the same scenarios. Both on one choice: the line wins, with a warning.
  `needs:` and `sets:` on a step, with no value, or given twice are reported with their
  line (SYN-17, SYN-18). The starter template and the text the extension writes back use
  the new lines (SYN-40).
- MIT license (`LICENSE`, `package.json`, README): free to use and share, with the
  copyright line kept.
- README: a table of contents with links to every section, and the starter template as
  the one syntax example (it replaces two older, different examples). A test keeps the
  README's copy equal to the template and checks that every contents link has a heading
  (SYN-41).
- The starter note has an expected result with a real value (a price, a status, an error
  code) on every step and choice, and concrete test data (account `user_001`, cards,
  addresses), so it can be turned into automated tests as it is. Choices only some paths
  can take say so in their name (`Express (members only)`), and Payment failed is not
  offered on a cash on delivery path (SYN-41).
- Property-based tests (fast-check, `test/property.test.ts`): each mode keeps the
  coverage it promises (CALC-30, 33, 34, 36), a loop is taken at most `max` times and a
  distinct loop never repeats a choice in its rounds (CALC-17). Checked by breaking the
  code on purpose: the tests fail.

### Fixed

- The README logo is a plain Markdown image, not an HTML `<p><img>` block: the extension
  page in Drawdy showed the HTML as text, while GitHub drew it.
- **`\[` in a choice's label** is a plain `[`, so a label can contain a `[` without it
  being read as the start of the options (SYN-13). Before, `- Pay [visa` lost its name.
  Nothing changes for labels without a `[`.
- A choice named like options, such as `Pay [visa]`, lost its name when the flow was
  written back with `formatFlow` and read again. `formatFlow` now adds an empty `[]`.
- Pairwise picked no scenario for a flow without choices (EP and Each picked one). All
  modes now pick at least one scenario when the flow has a path (CALC-83).

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
