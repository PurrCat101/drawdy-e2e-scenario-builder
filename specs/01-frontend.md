# 01 · Frontend (the panel)

The panel is the extension's window inside Drawdy (a webview). Code:
`editor/panel.html`, copied into `src/panelHtml.ts` by `npm run gen:editor`.
Drawdy's webview is small and cannot be resized (DRV-03), so the panel is a remote
control: flows are written on the board, not in the panel.

## Layout (top to bottom)

- **UI-15** The panel has three parts that fit Drawdy's small window: a header and a
  footer that stay in place, and a middle that scrolls when something in it is unfolded.
  With nothing unfolded the middle needs no scrolling. The header holds the target line
  (UI-02) and the mode switch (UI-05); the middle holds the messages (UI-03), the buttons
  and, under them, "Write flow" and "Start with a template"; the footer holds Place
  (UI-60) and the status line (UI-07).
- **UI-01** (removed) A title in the page: Drawdy's window already shows the name.
- **UI-02** The target line: one line saying what the buttons will use, from the board
  selection (UI-30), with a fuller sentence as its tooltip: "Select a note or frame on
  the board", "Text box flow · N steps", "1 flow note · N steps" ("N flow notes
  selected"), "N scenario notes selected", "Scenario frame · N scenarios", "Flow frame
  selected" or "Table selected · Copy only".
- **UI-03** The messages: the flow problems and errors (UI-45) and the warning of a big
  mode (UI-04), folded under one line.
- **UI-04** When the shown counts give the chosen mode more than 50 scenarios, the
  messages hold "Mode X: N scenarios (a lot; the board may get slow. …)", naming only
  the modes that would draw fewer, fewest first.
- **UI-05** The mode switch: All, Pair (default), Each. Each button carries its count
  ("Pair 5") when the counts are those of what the draw buttons use: the text box with
  nothing selected, or the one selected flow note (UI-40). Otherwise only the names show.
- **UI-18** The action buttons, in two groups, each under a small heading: **Draw**
  (Flow + Scenarios, which is primary and full width, then Flow, Scenarios and Flow per scenario, which is full width) and
  **Tables** (Test steps, Decision table and Steps list, each with a **Copy** button
  beside it: copy, copydecision, copysteps), and under Decision table a full-width
  **Decision table (interactive)** button (decisionhtml, UI-48).
- **UI-06** (removed) Three groups with a separate Export group; see UI-18.
- **UI-07** The status line, in the footer.
- **UI-49** (removed) The By ID group (the box and its two buttons) and Fit page are taken out of the panel. The selection kind `decisionpage` (an interactive table is selected) still turns off the buttons that draw from notes and frames, and says so in the label. An interactive table is resized with the handles on the board.
- **UI-48** **Decision table (interactive)** (decisionhtml) is on and off exactly as
  Decision table is (UI-31), and its label takes the same ` · N scenarios` (UI-33). Its
  tooltip says it is the same scenarios as Decision table, as a page that scrolls and filters
  (OUT-70). It has no Copy button: Copy decision table copies the same text.
- **UI-08** "Start with a template": one button; its tooltip says what it does.
- **UI-09** "Write flow" shows the text box in place of the middle of the panel, with
  "← Back" to return and "Pull from selected note".
- **UI-10** "syntax", folded, under the text box: a short syntax reminder.

## Buttons

- **UI-11** Each action button sends `action` with the button id, the text box text
  and the mode (DRV-20). The status line shows "Working..." until the driver answers.
- **UI-12** The Starter note button sends `template` with its id (`shop`).
- **UI-13** "Pull from selected note" sends `pull`; the answer (`fill`) puts the text
  in the text box and shows it (UI-09).
- **UI-14** Copy to clipboard: the driver sends `clip` with the text; the panel copies it
  (execCommand, then the Clipboard API) and says "Copied N scenario(s). Paste with
  Ctrl+V", or that the browser blocked it. A `warning` in the message follows the
  "Copied" line (DRV-58).

## Terminology

- **UI-20** Everything the user reads says "scenario", never "case" (a test checks
  labels, tooltips, placeholders and messages). "Test step" (TERM-06) is the name of a row
  of the Test steps table.
- **UI-21** No Thai text in what the user sees.

## Selection and buttons

- **UI-30** The panel polls `target` every 1.2 s; the answer gives the kind of
  selection: `none`, `flows` (`@builder` notes), `scenarios` (scenario notes), `frame`
  (a scenario frame), `flowframe` (a flow frame), `table`.
- **UI-31** Which buttons are on:

  | Selection | Flow | Scenarios | Flow + Scenarios | Test steps | Decision table | Steps list | Copy (test steps) | Copy (decision table) | Copy (steps list) |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | none, text box empty | off | off | off | off | off | off | off | off | off |
  | none, text in the text box | on | on | on | on | on | on | on | on | on |
  | flows | on | on | on | on | on | on | on | on | on |
  | scenarios | on ("Flow + Test steps") | off | on ("Flow only") | on | on | on | on | on | on |
  | frame | off | on | off | on | on | on | on | on | on |
  | flowframe | off | on | on | on | on | on | on | on | on |
  | table (a table or a decision table) | off | off | off | off | off | off | on | off | off |

  A button that is off is greyed out, keeps its place and says "Not available for what
  is selected".
- **UI-32** With scenario notes selected, the Flow button reads "Flow + Test steps".
- **UI-34** With scenario notes selected (a scenario note or a column head of a decision
  table, DRV-59), the Flow + Scenarios button, which has nothing to draw there, reads
  "Flow only" and is on: it draws just the flow of each selected scenario, without its
  test steps (DRV-60). With any other selection it reads "Flow + Scenarios" again.
- **UI-33** The Test steps and Decision table labels end with what they use,
  ` · N scenarios` (`· 1 scenario` for one): for a scenario frame or selected scenario
  notes, theirs; otherwise the chosen mode's count when the mode switch shows counts
  (UI-05). With nothing to use the label is just the name. With a table selected the Test
  steps button reads "Selected table": its Copy button copies that table.

## Counts while writing

- **UI-40** While exactly one `@builder` note is selected, the counts are that
  note's; otherwise they are the text box's. The mode switch's tooltip says which, and
  the counts are shown only as UI-05 says.
- **UI-41** While the selected note is being typed in, the driver sends `counting`:
  the mode switch fades (opacity 0.5) until the next counts arrive.
- **UI-42** The text box sends `preview` after the last key, waiting
  max(250 ms, 1.5 × the last count's time), at most 2 s.
- **UI-43** When a count took over 300 ms, the messages show "counted in X s".
- **UI-44** When the selected note is unselected, the driver sends `recount` and the
  panel sends `preview` for its text box at once.
- **UI-45** The messages show, in order: ERROR lines from the coverage safety net
  (DRV-41), the big-mode warning (UI-04), the limit line (UI-46), an INFO line when the
  counts come from a quick search (CALC-22), reading problems (up to 4), up to 3 flow
  check items, and "counted in X s" (UI-43). One line each, coloured by kind: ERROR red,
  INFO muted, the rest amber. All are folded under one line counting them ("1 error · 2
  warnings · 1 note"), so the buttons stay in view; the line is red when there is an
  error, and once opened the messages stay open while the counts change. A text that
  cannot be read adds "Cannot read the flow yet"; an empty text box has no messages.

## Big flows and modes

- **UI-46** When the flow is past the limit (CALC-20, CALC-24): the All button reads
  `All N+`, the big-mode warning of All (UI-04) adds "(partial: not every path is listed)", and a limit line says "Too big to list every path. Pair and
  Each still cover the flow; add needs / sets to cut paths." When the search could not
  finish (CALC-22) it says "Too big to list every path: some choices or pairs may be
  missing (see the flow check)." instead, and never claims coverage.
- **UI-47** The tooltip of each mode button says what the mode picks: "All: every path
  the flow allows.", "Pair: every choice, and every pair of choices that can meet.",
  "Each: every choice at least once."

## Placing

- **UI-60** In the footer, a switch **Place**: **By hand** (default) and
  **Auto**. Every action button and the starter note send the choice as `place`
  (DRV-70). The choice lasts while the panel is open; it is not stored.
- **UI-61** While a drawing is held (`placing` on), choosing **Auto** sends `place` with
  `how` `auto`, and Esc pressed in the panel sends it with `how` `cancel`. The panel has
  no other placing buttons; the status line says to click the board and that Esc cancels.

## Theme

- **UI-50** The panel uses Drawdy's theme variables; it applies a `theme` message
  when Drawdy's theme changes.
