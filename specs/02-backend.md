# 02 · Backend (the driver)

The driver is the extension's code that Drawdy runs (`src/index.ts`, built to
`main.js`; code layout below). It talks to Drawdy through commands and to the panel through messages.
There is no server: nothing leaves the user's browser.

## Lifecycle

- **DRV-01** Manifest: id `purrcat101.e2e-scenario-builder`, permissions `dom` (the
  toolbar button and the window) and `scene` (reading the selection and drawing).
  No other permission may be added without a spec change.
- **DRV-02** On activate: subscribe to the toolbar button, the theme and webview
  messages; add one toolbar button (this Drawdy version allows one per extension);
  reset all per-session state (DRV-42, DRV-43).
- **DRV-03** The toolbar button opens the panel (`command:webview:create`, which has
  no size option). If it cannot, a note on the board says why and names the
  permissions to allow.
- **DRV-04** The panel page gets Drawdy's theme as CSS variables at creation, and a
  `theme` message when the theme changes.

## Messages

- **DRV-10** Panel → driver:

  | Message | Fields | Meaning |
  | --- | --- | --- |
  | `ready` | | the page loaded |
  | `preview` | `text` | count the paste box text |
  | `target` | | what is selected? (polled every 1.2 s) |
  | `pull` | | send me the selected `@builder` note's text |
  | `template` | `id` | drop a starter note |
  | `action` | `action`, `text`, `mode` | a button: `flow`, `scenarios`, `board` (Flow + Scenarios), `table` (Test steps), `decision`, `copy` (Copy to clipboard), `copydecision` (Copy decision table) |

- **DRV-11** Driver → panel:

  | Message | Fields | Meaning |
  | --- | --- | --- |
  | `counts` | `counts` {all, ep, pair, min} or null, `steps`, `issues`, `ms`, `from` ("note" or absent) | the counts and issues to show |
  | `counting` | | the selected note is changing; counts will follow |
  | `recount` | | the note was unselected; count your paste box again |
  | `target` | `kind`, `n` | the selection (UI-30) |
  | `fill` | `text` | the selected note's text, for the paste box |
  | `status` | `text`, `bad` | a line for the status bar |
  | `clip` | `text`, `scenarios` | text to copy to the clipboard |
  | `theme` | `css` | new theme variables |

- **DRV-12** Unknown messages are ignored.

## Drawdy commands used

- **DRV-15** Only these: `command:scene:get-current-selected-drawdy-elements`,
  `command:scene:get-drawdy-elements`, `command:scene:add-drawdy-elements`,
  `command:scene:update-drawdy-elements`, `command:camera:get-viewport-rect`,
  `command:camera:fly-to-elements`, `command:dom:create-action-button`,
  `command:webview:create`, `command:webview:post-message`, and the subscriptions
  `dom:element-clicked`, `dom:theme-changed`, `webview:message`.

## What a button uses

- **DRV-20** A selection on the board wins over text in the paste box (for Flow,
  Scenarios and Flow + Scenarios when the selection holds something usable: a
  `@builder` note, a scenario note, a flow frame or a scenario frame).
- **DRV-21** Flow + Scenarios:
  - paste box text (nothing usable selected) → the flow diagram and the scenario frame
    of the chosen mode, in view;
  - `@builder` notes → for each note, its flow diagram under the note, then its
    scenario frame; a note that cannot be read gets a red note with the reading
    problems;
  - a flow frame → a new scenario frame from the flow stored on it.
- **DRV-22** Scenarios: like DRV-21 without the flow diagram (the scenario frame goes
  under the note); a flow frame or a **scenario frame** → a new scenario frame of the
  chosen mode from the flow stored on the frame.
- **DRV-23** Flow: paste box text or `@builder` notes → the flow diagram only; scenario
  notes → for each, the flow of that scenario next to its frame, and its table
  under it (Flow only draws the flow without the table, DRV-60).
- **DRV-24** Test steps: the test step tables of the first of these that applies:
  1. a selected scenario frame → all its scenarios, in the mode it was drawn in;
  2. selected scenario notes → those scenarios (from the flow stored on their frame);
  3. selected `@builder` notes → all scenarios of the chosen mode (or the note's
     `@mode`);
  4. a selected flow frame → all scenarios of the chosen mode;
  5. the paste box text → all scenarios of the chosen mode (or its `@mode`).
- **DRV-25** Copy to clipboard: the same choice as Test steps (or a selected table, which may be
  a decision table frame, OUT-64) as tab-separated text, sent with `clip`.
- **DRV-57** Decision table: draws the decision table (CALC-90 to 94, OUT-60 to 64) of
  the scenarios chosen as for Test steps (DRV-24), below the selection or in view; with
  scenario notes selected, only those scenarios; with several `@builder` notes selected,
  one table for each. Nothing is drawn, and the status says why, when the flow has no
  step with two or more choices ("Cannot draw a decision table: ...") or when there are
  more than 60 scenarios ("Could not draw: ... pick EP, Pair or Each, or press Copy decision
  table"). On success the
  status is "Decision table drawn (N scenarios)" and the view flies to the table.
- **DRV-58** Copy decision table: sends `clip` with the text of the decision table (OUT-64)
  of the scenarios chosen as for the Decision table button (DRV-57), and draws nothing.
  There is no limit on the number of scenarios (the 60 of DRV-57 is a limit of drawing):
  every scenario is one more column in one long row, so a spreadsheet can freeze the first
  two columns. With several `@builder` notes selected the tables follow each other,
  separated by an empty line. A flow with no step that decides copies nothing and says
  "Cannot copy a decision table: ...". A selected table is not a source (UI-31): Copy to
  clipboard copies it.
- **DRV-59** A column head of a decision table (OUT-66) is a scenario note for every
  button: Flow draws that scenario's flow and its table, Test steps and Copy to clipboard
  give its test steps, Decision table draws a table of just the selected heads, and the
  panel counts it as a scenario (`scenarios`). The flow and mode come from the frame the
  head is in, never from the note the table was made from, and the scenario is found by its
  path, not by its ID, which counts within one mode (CALC-57). A head whose frame does
  not keep its flow (a table drawn by an older version) gives no scenario: Test steps,
  Copy and Decision table say the scenarios no longer know their flow (Test steps and
  Copy add that the table is to be drawn again), and Flow draws only the red hint (DRV-27).
- **DRV-60** Flow only: the panel sends `flowonly` when the Flow + Scenarios button reads
  "Flow only" (UI-34). For each selected scenario note it draws the flow of that scenario
  next to its frame, as Flow does (DRV-23), and nothing under it: no Test steps table. The
  status is "Done". A scenario that cannot be read gets the same red hint as with Flow.
- **DRV-26** A mode written in the text (`@ep`, `@all`, `@pair`, `@min`, one-line form)
  wins over the panel's switch.
- **DRV-27** Nothing usable selected and no text: the status says "Write a flow in the
  box first, or select a sticky note on the board"; when a selection is not usable, a
  red hint text box explains what to select and describes what is selected.
- **DRV-28** Only one action runs at a time; a second press while busy answers "Busy,
  please wait".
- **DRV-29** The status line after an action is marked bad when it starts with "Could
  not", "Write a flow", "Select" or "Cannot"; errors are reported as "Error: …".

## Starter notes

- **DRV-30** `template` with a known id drops that starter note (05-board-output,
  OUT-40) and answers with a status line naming it; an unknown id does nothing.

## Live counts

- **DRV-40** `preview` answers `counts` for the text, worked out with the quick search
  budget (CALC-22). While a flow note's counts are shown (DRV-42), `preview` is
  ignored.
- **DRV-41** The live counts include a coverage safety net (each mode checked against
  CALC-36, ERROR lines when one falls short) for flows of at most 300 scenarios.
- **DRV-42** On `target`, when exactly one `@builder` note is selected: a newly
  selected note is counted at once (`counts` with `from: "note"`); when the same note's
  text changed since the last poll, the driver answers `counting` and counts it at the
  next poll if the text is still the same; an unchanged text sends nothing.
- **DRV-43** When that note is no longer selected, the driver sends `recount` once.
- **DRV-44** Every count goes through the remembered analysis (CALC-80), so a button
  pressed after the panel counted the same flow does not count again.

## Data kept on the board

The board keeps what is needed to work on drawn things later. Keys must stay readable
by later versions; a renamed key is written under the new name and still read under
the old one.

- **DRV-50** Flow frame: `meta.e2eFlow` = the flow. A scenario's own flow frame
  (Flow on a scenario note): `meta.e2eCase` = true (old name, kept).
- **DRV-51** Flow diagram parts: steps `meta.kind = "step"`, `stepId`; red end boxes
  `kind = "end"`, `condId`; the green end `kind = "end-ok"`.
- **DRV-52** Scenario frame: `meta.e2eScenarios` = true, `mode`, `count` (scenarios
  shown), `flow`.
- **DRV-53** Scenario note: `meta.kind = "scenario"`, `id`, `type` ("happy" / "neg"),
  `path` = [step index, choice id or null] per item.
- **DRV-54** Table: `meta.e2eScenarioTable` = true, `scenarios` (count), `tsv` (the
  copy text). Tables from earlier versions have `cases` instead of `scenarios`: read
  `scenarios ?? cases ?? 1`.
- **DRV-55** Without the stored data (copied notes, old boards), a scenario note is
  read back from its text (OUT-23).

## Code layout

- **DRV-56** The driver is split by job, so each file stays short and has one reason
  to change. `src/index.ts` only starts the driver (`activate`, `onEvent`, the toolbar
  button). Every other file is reached from it:
  - `host.ts`: the command channel to Drawdy (`run`), ids, the busy flag (DRV-28) and
    `note` (a status text box on the board). The only file that keeps state about the
    connection.
  - `webview.ts`: opening the panel, the theme (UI-50), messages to the panel.
  - `panelMessages.ts`: messages from the panel (`preview`, `pull`, `target`,
    `template`, `action`) and the live counts of the selected note (DRV-40 to DRV-44).
  - `actions.ts`: what each button does (Flow, Scenarios, Flow + Scenarios, Test
    steps, Decision table, Copy to clipboard, starter note).
  - `drawing.ts`: drawing the flow, the scenario frame and the tables on the board.
  - `decisionBoard.ts` (drawing the decision table as text boxes), used by the Decision
    table button; `textBox.ts`: the filled text boxes every note and the decision table
    are made of. `scenarioBoard.ts`, `scenarioTable.ts` and `render.ts` draw the scenario
    frame, the test steps tables and the flow diagram.
  - `core/`: everything that is not Drawdy: reading the text, the scenarios and modes, the
    texts of a report, the test steps and the decision table (CORE-01 to CORE-12, spec
    07). Files outside `core/` may import it; `core/` imports nothing from them.
  - `selection.ts`: reading the selection and the board, finding free space.
  A change of behaviour goes in the file of its job; no file may import `index.ts`.
