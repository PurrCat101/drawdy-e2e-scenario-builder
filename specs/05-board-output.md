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
  green end when that scenario fails. The flow of a note whose last step has choices
  that all end the flow has no green end either.

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

- **OUT-30** One embedded page per Test steps press, with no frame around it: the page is
  the element alone, named by its label `<label> · N scenarios` (`Test steps · MODE` for
  many scenarios), and it shows one scenario at a time (OUT-33), each as a table of its rows
  (OUT-31). A frame would own the elements inside it, and the page inside a frame did not
  take clicks in testing; the steps list (OUT-67) keeps its frame. Each scenario's title is `<ID> · Happy|Negative[ · P<n>][ · via negative]   <choices>`,
  and its ID is the Scenario column.
- **OUT-31** Columns: Scenario (the ID), `#`, Step, Condition, Setup, Test data, Expected
  result; one row per test step (TERM-06), the rows of each scenario in order. Step fields
  and the choice's fields are both shown.
- **OUT-33** Above the table of the Test steps page are two tabs, `Happy (n)` and
  `Negative (m)`, a search box `Find ID or text`, and arrows `‹ ›` with the position
  `<ID> · k of N`. The page shows one scenario: the first Happy one at first (the first
  Negative one when there is no Happy scenario). A tab shows the first scenario of its kind;
  the arrows step through the scenarios of the kind shown and stop at the ends. A tab with
  no scenarios is greyed out. Typing in the search box finds the scenarios whose text (every
  cell, any case, the ID included) contains what was typed, and the position reads
  `<ID> · k of N found`; the arrows and Enter step through those, and a tab or an empty box
  ends the search. With no match it reads `No match`. The copy text (OUT-32) keeps every
  scenario. The Steps list (OUT-67) has no tabs and no search box.
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
- **OUT-68** **Flow per scenario** draws the whole flow once, and below it two columns of cards
  for the scenarios of the chosen mode: Happy on the left, Negative on the right. Each column
  has a head `Happy (n)` or `Negative (m)`, and its cards are stacked under it, in order of
  where their scenario ends on the flow (left first). Each card is that scenario's own flow
  (OUT-11), named by its title, with its end green when the scenario passes and red when it
  fails. There is no limit on the number of cards.

- **OUT-69** Flow per scenario (OUT-68) draws no lines. Under each place on the flow where
  scenarios end (its end box, or its step when the choice goes on), it writes one text label
  with the IDs of the scenarios that end there, in the colour of their kind: green for Happy,
  red for Negative. Three IDs at most, then `+ n`. When both kinds end at one place, their
  labels stack, Happy first.

- **OUT-70** The interactive decision table (DRV-78) is one page in an iframe, not boxes,
  so it can scroll and filter; the boxes of OUT-60 stay as they are, and both can be drawn
  for the same scenarios. The page shows the same table as OUT-60 and OUT-64 (the same
  rows, the same X marks, the same ID heads, the Success and Negative bars).
  - **Modes**: the top has three buttons, `All n`, `Pair n` and `Each n`, each with the
    number of scenarios of that mode. The page opens on the mode the panel chose, and a
    button shows that mode's table. All is in the page up to 1000 scenarios; a mode with
    more has its button greyed out and the page says so.
  - **Height**: the page is as tall as its tallest mode needs, so every condition and every
    choice shows without scrolling down.
  - **Width**: at least 8 scenario columns show without scrolling, at most 20 (about what
    a 23-inch screen shows); more scroll sideways.
  - **Frozen**: the condition and choice columns and the heads stay in view while it
    scrolls, both ways.
  - **Filter**: clicking a condition shows the scenarios that take any of its choices;
    clicking a choice shows the scenarios that take it. Filters of different steps combine
    (and): `Login สำเร็จ` and `ACTIVE level 1` show the scenarios that take both. One choice
    per step: clicking another choice of a step that is already filtered replaces it. A
    second click on the same box removes that filter only; the others stay. The line above
    the table lists the filters and how many scenarios are left of how many (not their IDs,
    which the columns show);
    `Show all` removes every filter. Switching mode removes them too.
  - **Marks**: an X is one box with one `x` in it, no second `x` beside it.
  The page loads nothing from the network and links to nothing; it is plain text, so its
  text can be read and copied from it.
- **OUT-71** The pages in the board's iframes (the decision table of OUT-70, the Test steps
  table and the steps list of OUT-30 and OUT-67) use Drawdy's theme colours: their
  styles read Drawdy's tokens (`--dd-accent`, `--dd-surface-panel`, `--dd-text-primary`,
  `--dd-border-medium` and the others the panel uses), each with a fallback colour for
  when the theme has no such token. So they follow light and dark themes like the panel.
  No page sets a fixed colour outside those fallbacks.

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
  priority, `path` (as a scenario note keeps it, OUT-22), `mode` and `flowKey`, a
  fingerprint of the frame's flow (DRV-62). So the head can be
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
