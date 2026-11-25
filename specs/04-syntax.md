# 04 · Syntax

The text a flow is written in. Code: `src/syntax.ts` (`parseFlowText`, `formatFlow`).
The README's "Text syntax" is the user's guide to the same rules.

## The note

- **SYN-01** A sticky note is a flow only when its first non-empty, non-comment line
  is `@builder` (any letter case). The paste box does not need it.
- **SYN-02** `@title name` sets the drawn frame's title. Other `@` words in the block
  form: `@ep`/`@all`/`@pair`/`@min`/`@mode` give the warning "is not used; pick the
  mode in the panel"; anything else is "Unknown directive" with the closest known one.
- **SYN-03** Words of the syntax are English and case-insensitive; labels and field
  values can be in any language and are kept as written.

## Block form

- **SYN-10** A line is recognised by how it starts, never by indentation (a sticky
  note may lose it):

  | Starts with | Is |
  | --- | --- |
  | a number and `.` or `)` | a step; the number is how loops refer to it |
  | `-`, `*`, `•`, `–` and a space | a choice of the step above |
  | `given:` `data:` `then:` `req:` (also `setup:` = given, `expect:` = then) | a field |
  | `needs:` `sets:` (also `need:` and `set:`) | a field of a choice that is a path condition or a tag, not text (SYN-17) |
  | `#` or `//` | a comment |
  | `\` | a continuation line that would otherwise look like one of the above |

- **SYN-11** A field before a step's first choice belongs to the step; after it, to
  the last choice above. Other lines continue the previous field's value. Blank lines
  are ignored.
- **SYN-12** After a choice's label, its action: `-> end`, `-> loop`, `-> loop to step
  N`, `-> next`, each optionally with `max N` (also `xN`, `×N`, `max=N`); the arrow
  can be `->`, `→` or `=>`; `back N` is an older spelling of `loop to step N`.
  `max` is clamped to 1 … 9 and only means something on a loop.
- **SYN-13** Options in square brackets at the end, separated by `,` or `;`: `P1`
  `P2` `P3`, `variant`, `negative` (or `neg`), `distinct`, `sets a b`, `needs …` with
  `and`, `or`, `not`/`!`. To use a `[` in a label, write `\[`: it is read as a plain
  `[`, never as the start of the options (a `\` before any other character is kept as
  it is). `sets` and `needs` can also be written as fields on their own lines (SYN-17);
  the bracket spelling stays readable.
- **SYN-14** `-> end` makes a choice negative by itself.
- **SYN-15** `distinct` is kept only on a loop; elsewhere it gives the warning
  "distinct only works with loop to step N" and is dropped.
- **SYN-16** The block form is used when any line starts with a number or a bullet;
  otherwise the text is read as the one-line form (SYN-20).
- **SYN-17** `needs: …` and `sets: …` on a line of their own under a choice mean exactly
  what `[needs …]` and `[sets …]` mean (same words: `and`, `or`, `not`/`!`; tags
  separated by spaces or commas), so a flow gives the same scenarios whichever
  spelling is used. The value is the rest of that one line: a following line that is
  not a step, choice, field or comment is not part of it. The names are read in any
  letter case; `need:` and `set:` are accepted like `[need …]` and `[set …]`.
- **SYN-18** `needs:` and `sets:` are never read on a step, only on a choice. Reported
  with the line, and the rest is read on: one before the step's first choice or with no
  step above ("needs: must be under a choice"); one with no value; one given twice on a
  choice, or both as a field and in `[ ]` ("needs is given twice"). When given twice,
  the field is used over the bracket, and the later field over the earlier.

## One-line form

- **SYN-20** `Step (a | b) > Step (c | d)`: steps separated by `>`, choices in
  parentheses separated by `|`. `!label` ends negative, `-label` is negative and
  continues, `~N label` loops back to step N (`~` alone: the same step), options in
  `[ ]` as `P1 tag=x need=a,b variant max=2` (`need`: `,` and, `/` or, `!` not).
- **SYN-21** A first word `@ep`, `@all`, `@pair` or `@min` picks the mode for that
  text, over the panel's switch.

## Reading problems

- **SYN-30** Every problem is reported with its line ("Line 5: …") and the reading goes
  on; nothing in the text stops the rest from being read.
- **SYN-31** Reported: unknown directive, option or field (with "did you mean" when
  close), a step without a name, a repeated or out-of-order step number, a choice or
  field with no step above, a loop to a missing step, `loop to step` without a number,
  an unreadable action (kept as part of the label), a choice without a name, `max`
  outside a loop, `distinct` outside a loop, an unreadable line, and the `needs:` /
  `sets:` cases of SYN-18.

## Writing back

- **SYN-40** `formatFlow` writes a flow in the block form so that reading it back
  gives the same flow and the same scenario counts. A choice whose label ends in
  `[...]` and has no options gets an empty `[]` after it, so the label is not read as
  options. A `[` with no `]` after it, or after a backslash, is written `\[` (SYN-13).
  A choice's `needs` and `sets` are written as `needs:` and `sets:` fields under it
  (in that order), not in the brackets (SYN-17), before its `given:` field; `P`, `variant`, `negative`
  and `distinct` stay in the brackets.
- **SYN-41** The starter note (OUT-40) reads without any warning, gives scenarios and uses
  every kind of choice and field the syntax has (a distinct loop with max, an end, a
  variant, sets, needs with or and not, a req); its
  `#` lines explain the syntax and do not change the flow. Every step has an expected
  result (`then:`), on the step or on each of its choices, written as a value to assert
  (a number, a status, a code), and the test data is concrete (such as `user_001`), so
  the note can be turned into automated tests as it is. The README's syntax example is
  this note's text, word for word, so the README and the extension teach the same
  example; the README's short examples at the top are lines of it.
