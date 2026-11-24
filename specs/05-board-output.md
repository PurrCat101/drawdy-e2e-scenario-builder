# 05 · Board output

What the extension draws. Code: `src/render.ts` (flow diagram), `src/scenarioBoard.ts`
(scenario frame), `src/scenarioTable.ts` (tables, copy text), `src/scenarioFlow.ts`
(one scenario's flow), `src/templates.ts` (starter notes). `src/drawing.ts` puts them on
the board, `src/actions.ts` decides what to draw for each button.

## Placement

- **OUT-01** Everything new goes into free space: under its anchor (the selected
  note or frame, else the top left of the view), moved down past anything it would
  overlap, with a 100-unit gap. Nothing is drawn on top of existing elements.
- **OUT-02** After drawing, the camera flies to what was drawn.

## Flow diagram

- **OUT-10** A frame named after `@title` (else "E2E Flow"), holding the steps left to
  right, each choice that continues as an arrow to the next step, each `end` choice as
  a red box below its step, loops as dashed elbow arrows labelled `label ↻ ≤max`
  (`· distinct` added for distinct loops), and a green end after the last step.
- **OUT-11** A single scenario's flow (Flow on a scenario note) is drawn without the
  green end when that scenario fails.

## Scenario frame

- **OUT-20** Name: `Scenarios · <mode name> · N scenarios`, mode names "All Paths",
  "Equivalence Partitioning", "Pairwise (2-wise)", "Each-Choice (1-wise)".
- **OUT-21** A header note first (blue, pink when the flow check has errors), with:
  1. the mode name;
  2. `N of M paths · H happy · K negative`;
  3. `All a · EP b · Pairwise c · Each-Choice d`;
  4. the coverage line: `Coverage of N scenarios: choice x/y (p%) · loop end x/y (p%)
     · pair x/y (p%)` (loop end only when the flow has loop ends);
  5. `OK: every choice[, every loop end][ and every pair] is covered` (pairs only for
     Pairwise and All), or `MISSING choices: …`, `MISSING loop ends: …`, `MISSING
     pairs: N`, naming up to 6;
  6. `Never reachable (see the flow check): …` when there are unreachable choices;
  7. requirements, when the flow has `req:` (OUT-25);
  8. the mode tip (CALC-70);
  9. the flow check items, if any.
- **OUT-22** Then one note per scenario, Happy first, then Negative, each by priority
  then ID; 4 columns up to 40 scenarios, more columns (at most 12) above that. Colour:
  pink = Negative, orange = Happy with loops, green = other Happy.
- **OUT-23** A scenario note is itself in the flow syntax: `@builder`, `@title <ID> ·
  Happy|Negative · P<n>[ · via negative][ · loop xN]`, then the steps it passes with
  only the choice it takes and their fields (no priority, tags or rules). An EP note
  ends with `# also stands for N similar` when it represents others.
- **OUT-24** Selecting a scenario note and pressing Flow draws that scenario's flow
  and its table (DRV-23).
- **OUT-25** Requirements: `Requirements: x/y covered`, then for up to 12
  requirements `  <req> → <IDs>` (at most 6 IDs, then `… (n)`), `  … and N more`, and
  `MISSING requirements: …`. A step's `req` counts for every scenario through the
  step, a choice's for every scenario that takes it. Several ids in one field are
  separated by commas.

## Tables

- **OUT-30** One frame per Table press, named `<label> · N scenarios` (`Test sequence ·
  MODE` for many scenarios), holding one embedded page with a table per scenario under
  its title: `<ID> · Happy|Negative[ · P<n>][ · via negative]   <choices>`.
- **OUT-31** Columns: `#`, Step, Condition, Setup, Test data, Expected result; one row
  per test case (TERM-06). Step fields and the choice's fields are both shown.
- **OUT-32** The copy text (Copy table) is tab-separated, one header row
  `Scenario  #  Step  Condition  Setup  Test data  Expected result`, one row per test
  case, values with tabs, quotes or line breaks quoted for spreadsheets.

## Starter notes

- **OUT-40** Three notes, Basic, Loop and Levels, 520 units wide, yellow, font 14,
  each a complete `@builder` flow whose `#` lines explain the syntax it uses (SYN-41).
  Height follows the number of lines.
- **OUT-41** A starter note is placed in free space in the view (OUT-01), and a second
  press puts the next note below the first.
