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
  it is).
- **SYN-14** `-> end` makes a choice negative by itself.
- **SYN-15** `distinct` is kept only on a loop; elsewhere it gives the warning
  "distinct only works with loop to step N" and is dropped.
- **SYN-16** The block form is used when any line starts with a number or a bullet;
  otherwise the text is read as the one-line form (SYN-20).

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
  outside a loop, `distinct` outside a loop, an unreadable line.

## Writing back

- **SYN-40** `formatFlow` writes a flow in the block form so that reading it back
  gives the same flow and the same scenario counts. A choice whose label ends in
  `[...]` and has no options gets an empty `[]` after it, so the label is not read as
  options. A `[` with no `]` after it, or after a backslash, is written `\[` (SYN-13).
- **SYN-41** The starter note (OUT-40) reads without any warning, gives scenarios and uses
  every kind of choice and field the syntax has (a distinct loop with max, an end, a
  variant, sets, needs with or and not, a req); its
  `#` lines explain the syntax and do not change the flow. Every step has an expected
  result (`then:`), on the step or on each of its choices, written as a value to assert
  (a number, a status, a code), and the test data is concrete (such as `user_001`), so
  the note can be turned into automated tests as it is. The README's syntax example is
  this note's text, word for word, so the README and the extension teach the same
  example; the README's short examples at the top are lines of it.
