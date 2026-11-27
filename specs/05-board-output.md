# 05 · Board output

What the extension draws. Code: `src/render.ts` (flow diagram), `src/scenarioBoard.ts`
(scenario frame), `src/scenarioTable.ts` (tables), `src/decisionBoard.ts` (decision
table); the words they draw come from the core (`src/core/scenarioText.ts`: note text,
header, coverage; `src/core/testSteps.ts`: rows and copy text; `src/core/decisionTable.ts`;
`src/core/scenarioFlow.ts`: one scenario's flow; `src/core/templates.ts`: starter notes). `src/drawing.ts` puts them on
the board, `src/actions.ts` decides what to draw for each button.

## Placement

- **OUT-01** Placed automatically (DRV-70, DRV-74), everything new goes into free space: under its anchor (the selected
  note or frame, else the top left of the view), moved down past anything it would
  overlap, with a 100-unit gap. Nothing is drawn on top of existing elements.
- **OUT-02** After drawing automatically (DRV-70), the camera flies to what was drawn.
  Placed by hand, the camera never moves (DRV-71).

## Flow diagram

- **OUT-10** A frame named after `@title` (else "E2E Flow"), holding the steps left to
  right, each choice that continues as an arrow to the next step, each `end` choice as
  a red box below its step, loops as dashed elbow arrows labelled `label ↻ up to N times`
  (`time` when N is 1), and a green end after the last step. The diagram uses only plain
  words, so it can be shown to people who do not know the syntax: no `distinct`, `sets`,
  `needs` or priority appears on it.
- **OUT-12** On the flow diagram a choice's label is always on one line, never wrapped
  in the middle; several choices on one arrow are one per line. The arrow after a step
  is made as long as its longest label needs (about 7 units a character), so a reader
  can tell which step a label belongs to.
- **OUT-11** A single scenario's flow (Flow on a scenario note) is drawn without the
  green end when that scenario fails.

## Scenario frame

- **OUT-20** Name: `Scenarios · <mode name> · N scenarios`, mode names "All Paths",
  "Equivalence Partitioning", "Pairwise (2-wise)", "Each-Choice (1-wise)".
- **OUT-21** A header note first (a text box, blue; pink when the flow check has errors), with:
  1. the mode name;
  2. `N of M paths · H happy · K negative`;
  3. `All a · Pairwise c · Each-Choice d`;
     past the limit (CALC-20, CALC-24) line 2 reads `N of M listed paths (the flow has
     more) · …` and line 3 reads `All a+ · …`;
  4. the coverage line: `Coverage of N scenarios: choice x/y (p%) · loop end x/y (p%)
     · pair x/y (p%)` (loop end only when the flow has loop ends);
  5. `OK: every choice[, every loop end][ and every pair] is covered` (pairs only for
     Pairwise and All), or `MISSING choices: …`, `MISSING loop ends: …`, `MISSING
     pairs: N`, naming up to 6, and `MISSING base path: …` when no shown scenario is a
     base path (CALC-28; a safety net, like the other MISSING lines);
  6. `Never reachable (see the flow check): …` when there are unreachable choices;
  7. requirements, when the flow has `req:` (OUT-25);
  8. the flow check items, if any.
- **OUT-22** Then one note per scenario, Happy first, then Negative, each by priority
  then ID; 4 columns up to 40 scenarios, more columns (at most 12) above that. Fill
  colour: pink = Negative, orange = Happy with loops, green = other Happy.
- **OUT-23** A scenario note is itself in the flow syntax: `@builder`, `@title <ID> ·
  Happy|Negative · P<n>[ · via negative][ · loop xN]`, then the steps it passes with
  only the choice it takes and their fields (no priority, tags or rules).
- **OUT-24** Selecting a scenario note and pressing Flow draws that scenario's flow
  and its table (DRV-23).
- **OUT-25** Requirements: `Requirements: x/y covered`, then for up to 12
  requirements `  <req> → <IDs>` (at most 6 IDs, then `… (n)`), `  … and N more`, and
  `MISSING requirements: …`. A step's `req` counts for every scenario through the
  step, a choice's for every scenario that takes it. Several ids in one field are
  separated by commas.

## Tables

- **OUT-30** One frame per Test steps press, named `<label> · N scenarios` (`Test steps ·
  MODE` for many scenarios), holding one embedded page with a table per scenario under
  its title: `<ID> · Happy|Negative[ · P<n>][ · via negative]   <choices>`.
- **OUT-31** Columns: `#`, Step, Condition, Setup, Test data, Expected result; one row
  per test step (TERM-06). Step fields and the choice's fields are both shown.
- **OUT-32** The copy text (Copy to clipboard) is tab-separated, one header row
  `Scenario  #  Step  Condition  Setup  Test data  Expected result`, one row per test
  step, values with tabs, quotes or line breaks quoted for spreadsheets.

## Starter notes

- **OUT-67** The steps list (DRV-61) is one frame named `Steps list · N steps`, holding one
  embedded page with a table per flow (`All steps` for one flow, `Flow 1`, `Flow 2`... for
  more) with the columns of OUT-31 and a last column `Req`. One row per choice of a step,
  in the order of the flow; a step with no choice is one row. A row shows the step's fields
  and the choice's fields as OUT-31 does, and in `Req` the requirement IDs of the step and
  of the choice, each once, joined by `, `. The frame keeps the text of the table (tab-
  separated, one header row `#  Step  Condition  Setup  Test data  Expected result  Req`,
  quoted as OUT-32) and the number of steps, so Copy to clipboard copies it (DRV-25).
- **OUT-40** One note, an online-shop checkout (Authentication, products with a loop,
  shipping, payment), a text box 520 units wide with a yellow fill, font 14. It is a complete `@builder` flow
  whose `#` lines explain the syntax it uses, and it uses every kind of choice and field
  the syntax has (SYN-41). Its fields hold concrete values (account `user_001`, prices,
  status codes), not descriptions.
  Its height fits the text (OUT-50).
- **OUT-41** A starter note is placed in free space in the view (OUT-01), and a second
  press puts the next note below the first.

## Text boxes

- **OUT-50** Every note the extension puts on the board (the starter note, the header and
  scenario notes of a scenario frame, hints and errors) is a text box: a rectangle with a
  coloured fill, a border in a darker shade of the same colour, rounded corners, and the
  text left-aligned from the top and always black (`#000000`) whatever the fill, never a
  sticky note, because a rectangle can be given any width and height. Its height is the height the text needs at its width and font
  size (about 0.6 x the font size a character, 1.4 x a line, 12 units of space inside the
  border), so no text is cut off and no box is much taller than its text.

## Decision table

- **OUT-60** A decision table (CALC-90 to 94) is drawn as plain elements, text boxes
  with a fill, never an embedded page, so the writer can move them, add a column or write
  a note beside them. Each text is black (OUT-50). It is in a frame named
  `Decision table · <mode name> · N scenarios`, placed like the other drawings (OUT-01).
- **OUT-61** The top has a green bar `Success` over the Happy columns and a red bar
  `Negative` over the Negative scenarios, then a box for each column named by the
  scenario's ID (`TSS-001`, `TSN-001`; the IDs of the scenario notes of the same mode,
  CALC-57), so a column is found on the board by its ID (OUT-65). At most 10 columns go
  in one frame: more are drawn in more frames, one under the other, named
  `Decision table · <mode name> · Scenarios a to b of N`.
- **OUT-62** Down the left, a box `<n>. <step name>` for each step (CALC-90), with a grey
  box for each of its values to the right of it, and an `X` box in a column where the
  value is marked (CALC-92). A step without choices has no value box: the place is
  left open, and its X boxes stand in the row of the step. Every step
  box has the same colour, whether the step decides or not. A value box is as tall as its
  text needs (OUT-50).
- **OUT-63** (removed) A note of expected results under the decision table; they are in the
  Test steps table (OUT-31).
- **OUT-66** Every frame of a decision table keeps a snapshot of the flow it was made
  from and its mode, and every column head keeps `kind: "scenario"`, its `id`, `type`,
  priority, `path` (as a scenario note keeps it, OUT-22) and `mode`. So the head can be
  traced back (DRV-59) after the note is edited, after another table is drawn, and
  although the same ID names another scenario in another mode (CALC-57). No other box of
  the table carries scenario data.
- **OUT-64** Every frame of a decision table carries the text of the whole table, as
  tab-separated text for a spreadsheet, and the number of scenarios (so Copy to clipboard
  copies it, DRV-25): the row `Condition, Combination, TSS-001…` (the scenario IDs), a `Group` row
  (`Success` or `Negative`) and the value rows with an `X`. A value
  with a tab, a quote or a line break is quoted.
- **OUT-65** Column k of a decision table and note k of the Scenarios frame drawn for the
  same selection and mode are the same scenario: both are in the order of OUT-22 and
  show the same ID. An ID counts within one mode (CALC-57), so the same scenario can have
  another ID in another mode: a scenario read off the decision table is found by its ID
  on the notes of the same mode, and selecting its note gives its Flow and Test steps
  (OUT-24).
