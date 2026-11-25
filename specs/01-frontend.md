# 01 · Frontend (the panel)

The panel is the extension's window inside Drawdy (a webview). Code:
`editor/panel.html`, copied into `src/panelHtml.ts` by `npm run gen:editor`.
Drawdy's webview is small and cannot be resized (DRV-03), so the panel is a remote
control: flows are written on the board, not in the panel.

## Layout (top to bottom)

- **UI-01** Title "E2E Scenario Builder".
- **UI-02** The target line: what the buttons will use, from the board selection
  (UI-30).
- **UI-03** Counts: steps, All, EP, Pairwise, Each-Choice, for the selected flow note
  or the paste box (UI-40), then the issues line (flow problems, tip, errors).
- **UI-04** The plan line: "Mode X: N scenarios". Above 50 it adds "(a lot; the board
  may get slow. …)", naming only the modes that would draw fewer, fewest first.
- **UI-05** The mode switch: All, EP (default), Pair, Each.
- **UI-06** The action buttons, in three groups, each under a small heading: **Draw**
  (Flow, Scenarios, Flow + Scenarios, which is primary and full width), **Tables** (Test
  steps and Decision table, each full width) and **Export** (Copy to clipboard and
  Copy decision table, each full width).
- **UI-07** The status line, right under the buttons.
- **UI-08** "Start a flow on the board": one Starter note button, "Start with a template",
  and one hint line.
- **UI-09** "Paste or type text here", folded by default: the paste box and "Pull
  from selected note".
- **UI-10** "syntax", folded: a short syntax reminder.

## Buttons

- **UI-11** Each action button sends `action` with the button id, the paste box text
  and the mode (DRV-20). The status line shows "Working..." until the driver answers.
- **UI-12** The Starter note button sends `template` with its id (`shop`).
- **UI-13** "Pull from selected note" sends `pull`; the answer (`fill`) puts the text
  in the paste box and unfolds it.
- **UI-14** Copy to clipboard: the driver sends `clip` with the text; the panel copies it
  (execCommand, then the Clipboard API) and says "Copied N scenario(s). Paste with
  Ctrl+V", or that the browser blocked it.

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

  | Selection | Flow | Scenarios | Flow + Scenarios | Test steps | Decision table | Copy to clipboard | Copy decision table |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | none, paste box empty | off | off | off | off | off | off | off |
  | none, text in the paste box | on | on | on | on | on | on | on |
  | flows | on | on | on | on | on | on | on |
  | scenarios | on ("Flow + Test steps") | off | on ("Flow only") | on | on | on | on |
  | frame | off | on | off | on | on | on | on |
  | flowframe | off | on | on | on | on | on | on |
  | table (a table or a decision table) | off | off | off | off | off | on | off |

  A button that is off says "Not available for what is selected".
- **UI-32** With scenario notes selected, the Flow button reads "Flow + Test steps".
- **UI-34** With scenario notes selected (a scenario note or a column head of a decision
  table, DRV-59), the Flow + Scenarios button, which has nothing to draw there, reads
  "Flow only" and is on: it draws just the flow of each selected scenario, without its
  test steps (DRV-60). With any other selection it reads "Flow + Scenarios" again. The
  box above the buttons names both buttons.
- **UI-33** The Test steps, Decision table, Copy to clipboard and Copy decision table
  labels end with what they use: ` · N scenarios` (`· 1 scenario` for one) for a scenario
  frame or selected scenario notes, ` · selected table` (Copy to clipboard only) for a selected table, or
  ` · M · N scenarios` (the mode and its count) for the paste box. With nothing to use
  the label is just the name. The box above the buttons says what is selected (UI-02).

## Counts while writing

- **UI-40** While exactly one `@builder` note is selected, the counts are that
  note's, preceded by "Selected note:"; otherwise they are the paste box's. The
  counts box's tooltip says which.
- **UI-41** While the selected note is being typed in, the driver sends `counting`:
  the counts fade (opacity 0.5) until the next counts arrive.
- **UI-42** The paste box sends `preview` after the last key, waiting
  max(250 ms, 1.5 × the last count's time), at most 2 s.
- **UI-43** When a count took over 300 ms, the counts show "counted in X s".
- **UI-44** When the selected note is unselected, the driver sends `recount` and the
  panel sends `preview` for its paste box at once.
- **UI-45** The issues show, in order: ERROR lines from the coverage safety net
  (DRV-41), an INFO line when the counts come from a quick search (CALC-22), reading
  problems (up to 4), the mode tip (CALC-70), and up to 3 flow check items. One line
  each, coloured by kind: ERROR red, TIP and INFO muted, the rest amber. Only the first
  two are shown; the others fold under "N more", so the buttons stay in view.

## Theme

- **UI-50** The panel uses Drawdy's theme variables; it applies a `theme` message
  when Drawdy's theme changes.
