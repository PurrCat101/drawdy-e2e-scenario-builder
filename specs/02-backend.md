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
  | `action` | `action`, `text`, `mode` | a button: `flow`, `scenarios`, `board` (Flow + Scenarios), `table`, `copy` |

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
  under it.
- **DRV-24** Table: the test case tables of the first of these that applies:
  1. a selected scenario frame → all its scenarios, in the mode it was drawn in;
  2. selected scenario notes → those scenarios (from the flow stored on their frame);
  3. selected `@builder` notes → all scenarios of the chosen mode (or the note's
     `@mode`);
  4. a selected flow frame → all scenarios of the chosen mode;
  5. the paste box text → all scenarios of the chosen mode (or its `@mode`).
- **DRV-25** Copy table: the same choice as Table (or a selected table) as
  tab-separated text, sent with `clip`.
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
  - `actions.ts`: what each button does (Flow, Scenarios, Flow + Scenarios, Table, Copy
    table, starter note).
  - `drawing.ts`: drawing the flow, the scenario frame and the tables on the board.
  - `selection.ts`: reading the selection and the board, finding free space.
  A change of behaviour goes in the file of its job; no file may import `index.ts`.
