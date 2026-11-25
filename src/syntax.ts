// The text syntax for flows: reading it (parseFlowText) and writing it back
// (formatFlow). Pure logic with no imports besides types, so that the very same
// code is used by the extension and, transpiled by scripts/gen-editor.mjs, by
// the builder page.
//
// A sticky note is only read when it starts with `@builder` (see hasMarker);
// other notes are left alone. The text typed into the panel needs no marker.
//
// Two forms are understood and told apart automatically:
//
//   blocks   one step per block (any line starting with a number is a step)
//              @builder
//              1. Open the site
//                 given: the shop is up
//                 data: user a
//                 then: login dialog closes
//                 - Login ok [P1]
//                 - Login failed -> end [P2]
//              2. Pick an item
//                 - shirt [variant]
//                 - sold out -> loop to step 2 max 2 [negative]
//   compact  the one-liner:  Login (ok | !fail) > Pick (a | b) > Pay
//
// Nothing depends on indentation (a sticky note may not keep it): a line is
// recognised by how it starts. `1.` a step, `-` a condition, `name:` a field
// (given / data / then / req; `setup` and `expect` are older names, still read).

import type { Cond, Flow, Mode, Step } from "./flow";

export type ParseResult = {
    flow: Flow;
    format: "blocks" | "compact";
    /** the note started with `@builder` */
    marked: boolean;
    /** a mode written in a compact text (@pair ...), if any; the UI's otherwise */
    mode: Mode | null;
    title: string;
    /** problems found, each with its line (or step) so they can be shown as-is */
    warnings: string[];
};

export type ParseOptions = {
    /** id generator for steps and conditions (default: i1, i2, ...) */
    id?: () => string;
};

const MODE_ALIASES: Record<string, Mode> = {
    ep: "ep",
    all: "all",
    pair: "pair",
    pairwise: "pair",
    min: "min",
    each: "min",
};

/* ------------------------------- helpers ---------------------------------- */

const normalize = (s: string) => s.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const isComment = (t: string) => /^(#|\/\/)/.test(t);

function newCond(id: string, label: string): Cond {
    return {
        id,
        label,
        neg: false,
        action: "next",
        target: null,
        max: 1,
        tags: "",
        need: "",
        pri: "",
        variant: false,
        data: "",
        exp: "",
        pre: "",
        req: "",
    };
}

function newStep(id: string, name: string): Step {
    return { id, name, conds: [], data: "", exp: "", pre: "", req: "" };
}

function distance(a: string, b: string): number {
    const d: number[][] = [];
    for (let i = 0; i <= a.length; i++) d.push([i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(
                d[i - 1][j] + 1,
                d[i][j - 1] + 1,
                d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
    return d[a.length][b.length];
}

/** The known word closest to `word` (at most 2 edits away), for "did you mean". */
function suggest(word: string, known: string[]): string | null {
    const w = word.toLowerCase();
    if (w.length < 3) return null;
    let best: string | null = null;
    let bd = 3;
    for (const k of known) {
        const dist = distance(w, k.toLowerCase());
        if (dist < bd) {
            bd = dist;
            best = k;
        }
    }
    return best;
}

const didYouMean = (word: string, known: string[]) => {
    const s = suggest(word, known);
    return s ? ` (did you mean ${s}?)` : "";
};

/** "master and lv1", "!master or lv2" -> the engine's form: `master,lv1`, `!master|lv2` */
export function needFromWords(expr: string): string {
    return expr
        .trim()
        .split(/\s+and\s+/i)
        .map((term) =>
            term
                .split(/\s+or\s+/i)
                .map((alt) => {
                    const m = alt.trim().match(/^(?:!|not\s+)\s*(.*)$/i);
                    return (m ? "!" + m[1].trim() : alt.trim()).replace(/\s+/g, "");
                })
                .filter(Boolean)
                .join("|")
        )
        .filter(Boolean)
        .join(",");
}

/** The engine's `need` back into words: `master,lv1` -> "master and lv1" */
export function needToWords(need: string): string {
    return need
        .split(",")
        .map((term) =>
            term
                .split("|")
                .map((a) => a.trim())
                .filter(Boolean)
                .join(" or ")
        )
        .filter(Boolean)
        .join(" and ");
}

const tagsFromWords = (s: string) => s.split(/[\s,]+/).filter(Boolean).join(",");

/* ------------------------------- detection --------------------------------- */

/**
 * Does the note start with `@builder`? Only such notes are read from the board.
 * Blank lines and comments before it do not count.
 */
export function hasMarker(text: string): boolean {
    for (const raw of normalize(text).split("\n")) {
        const t = raw.trim();
        if (!t || isComment(t)) continue;
        return /^@builder\b/i.test(t);
    }
    return false;
}

/**
 * Blocks form: some line starts with a step number (`1.`) or with a bullet
 * (`- `). A compact text has neither at the start of a line.
 */
const usesBlocks = (src: string) =>
    /^\s*\d+[.)]\s*\S/m.test(src) || /^\s*[-*•–]\s+\S/m.test(src);

/* ------------------------------- the entry --------------------------------- */

export function parseFlowText(text: string, opts: ParseOptions = {}): ParseResult {
    let n = 0;
    const id = opts.id ?? (() => "i" + ++n);
    const src = normalize(text);
    const warnings: string[] = [];
    const marked = hasMarker(src);
    if (usesBlocks(src)) {
        const r = parseBlocks(src, id, warnings);
        return { flow: { steps: r.steps }, format: "blocks", marked, mode: null, title: r.title, warnings };
    }
    // compact: drop the @builder / @title lines, the rest is the one-liner
    let title = "";
    const body = src
        .split("\n")
        .filter((l) => {
            const t = l.trim();
            const tm = t.match(/^@title\b\s*(.*)$/i);
            if (tm) {
                title = oneLine(tm[1]);
                return false;
            }
            return !/^@builder\b/i.test(t);
        })
        .join("\n");
    const r = parseCompact(body, id, warnings);
    return { flow: { steps: r.steps }, format: "compact", marked, mode: r.mode, title, warnings };
}

/* ------------------------------ blocks form -------------------------------- */

type FieldKey = "data" | "exp" | "pre" | "req";

/** the field names, exactly as written in the text */
const FIELD_KEYS: Record<string, FieldKey> = {
    given: "pre", // setup / precondition (Gherkin's word)
    data: "data",
    then: "exp", // expected result (Gherkin's word)
    req: "req",
    // older names, still read
    setup: "pre",
    expect: "exp",
};

/** `needs:` / `sets:` on a choice: not text, so they are kept apart from FIELD_KEYS (SYN-17) */
const COND_FIELD_KEYS: Record<string, "need" | "tags"> = {
    needs: "need",
    need: "need",
    sets: "tags",
    set: "tags",
};

const BRACKET_WORDS =["variant", "negative", "distinct", "sets", "needs", "P1", "P2", "P3"];

/** `-> end`, `-> loop`, `-> loop to step 3 max 2`, `-> next` at the end of a condition line */
/**
 * Options at the end of a line: `label [options]`. A `[` written `\[` is part of the
 * label, not the start of the options (SYN-13).
 */
const OPTIONS_AT_END = /^([\s\S]*?)\s*(?<!\\)\[([^\]]*)\]\s*$/;
/** `\[` in a label is a plain `[`. */
const unescapeBracket = (label: string) => label.replace(/\\\[/g, "[");

const ARROW_RE = /\s*(?:->|→|=>)\s*(end|loop|back|next)((?:\s+\S+){0,6})\s*$/i;

type PendingLoop = { cond: Cond; step: Step; num: number | null; line: number };

function parseBlocks(
    src: string,
    id: () => string,
    warnings: string[]
): { steps: Step[]; title: string } {
    const lines = src.split("\n");
    const steps: Step[] = [];
    const numToIndex: Record<number, number> = {};
    const loops: PendingLoop[] = [];
    let cur: Step | null = null;
    let curCond: Cond | null = null;
    let open: { obj: Step | Cond; key: FieldKey } | null = null;
    let title = "";
    let lastNum = 0;

    const warn = (ln: number, msg: string) => warnings.push(`Line ${ln}: ${msg}`);
    const append = (o: { obj: Step | Cond; key: FieldKey }, v: string) => {
        const old = (o.obj[o.key] as string) || "";
        o.obj[o.key] = old ? old + "\n" + v : v;
    };

    for (let i = 0; i < lines.length; i++) {
        const ln = i + 1;
        const t = lines[i].trim();
        if (!t) {
            open = null;
            continue;
        }
        // a continuation line that would otherwise look like structure: `\- text`
        if (open && t[0] === "\\") {
            append(open, t.slice(1).trim());
            continue;
        }
        if (isComment(t)) continue;

        // @directives
        const dm = t.match(/^@([A-Za-z_-]+)\s*(.*)$/);
        if (dm) {
            open = null;
            const name = dm[1].toLowerCase();
            if (name === "builder") continue;
            if (name === "title") title = oneLine(dm[2]);
            else if (name === "mode" || MODE_ALIASES[name])
                warn(ln, "@" + dm[1] + " is not used; pick the mode in the panel");
            else warn(ln, `Unknown directive @${dm[1]}${didYouMean(name, ["builder", "title"])}`);
            continue;
        }

        // 1. a step
        const sm = t.match(/^(\d+)[.)]\s*(.*)$/);
        if (sm) {
            const num = +sm[1];
            cur = newStep(id(), sm[2].trim());
            curCond = null;
            open = null;
            if (!cur.name) warn(ln, `Step ${num} has no name`);
            if (num in numToIndex) warn(ln, `Step number ${num} is repeated (the first one is used when referring to it)`);
            else {
                if (num <= lastNum) warn(ln, `Step number ${num} is out of order`);
                numToIndex[num] = steps.length;
                lastNum = num;
            }
            steps.push(cur);
            continue;
        }

        // - a condition
        const cm = t.match(/^[-*•–]\s+(.*)$/);
        if (cm) {
            open = null;
            if (!cur) {
                warn(ln, "A condition must be under a step (start a step with a number, like `1. Step name`)");
                continue;
            }
            curCond = parseCondLine(cm[1], ln, cur, id, loops, warn);
            cur.conds.push(curCond);
            continue;
        }

        // name: a field of the step (before its first condition) or of the last condition
        const fm = t.match(/^([A-Za-z]{2,12})\s*:\s*(.*)$/);
        if (fm) {
            // needs: / sets: belong to a choice only, and are one line (SYN-17, SYN-18)
            const ck = COND_FIELD_KEYS[fm[1].toLowerCase()];
            if (ck) {
                open = null;
                const name = ck === "need" ? "needs" : "sets";
                const value = fm[2].trim();
                const parsed = ck === "need" ? needFromWords(value) : tagsFromWords(value);
                if (!curCond) warn(ln, `${name}: must be under a choice`);
                else if (!parsed) warn(ln, `${name}: has no value`);
                else {
                    if (curCond[ck]) warn(ln, `${name} is given twice (the later one is used)`);
                    curCond[ck] = parsed;
                }
                continue;
            }
            const key = FIELD_KEYS[fm[1].toLowerCase()];
            if (key) {
                const owner = curCond ?? cur;
                if (!owner) {
                    warn(ln, `${fm[1]}: must be under a step`);
                    continue;
                }
                open = { obj: owner, key };
                append(open, fm[2].trim());
                continue;
            }
            const near = suggest(fm[1], [...Object.keys(FIELD_KEYS), "needs", "sets"]);
            if (near) {
                warn(ln, `Unknown field "${fm[1]}:" (did you mean ${near}:?)`);
                open = null;
                continue;
            }
        }

        // anything else continues the open field
        if (open) {
            append(open, t);
            continue;
        }
        warn(ln, `Cannot read this line: "${clip(t)}"`);
    }

    // resolve loops now that every step number is known
    for (const p of loops) {
        if (p.num === null) {
            p.cond.target = p.step.id; // loop: the same step
            continue;
        }
        const k = numToIndex[p.num];
        if (k === undefined) {
            warn(p.line, `There is no step ${p.num} to loop to`);
            p.cond.action = "next";
            p.cond.target = null;
            continue;
        }
        p.cond.target = steps[k].id;
    }
    if (!steps.length) warnings.push("No step found (start a line with a number, like `1. Step name`)");
    return { steps, title };
}

function parseCondLine(
    text: string,
    ln: number,
    step: Step,
    id: () => string,
    loops: PendingLoop[],
    warn: (ln: number, msg: string) => void
): Cond {
    let body = text.trim();
    let inner = "";
    const br = body.match(OPTIONS_AT_END);
    if (br) {
        body = br[1];
        inner = br[2];
    }
    const cond = newCond(id(), body);

    // -> end | -> loop | -> loop to step 3 | -> loop to step 3 max 2 | -> next
    // (`back 3` is the older spelling of `loop to step 3`; `x2` of `max 2`)
    const am = body.match(ARROW_RE);
    if (am) {
        const kind = am[1].toLowerCase() as "end" | "loop" | "back" | "next";
        const toks = am[2].trim() ? am[2].trim().split(/\s+/) : [];
        let num: number | null = null;
        let toWord = kind === "back";
        let max = 1;
        let k = 0;
        let ok = true;
        if (kind === "loop" || kind === "back") {
            if (/^to$/i.test(toks[k] || "")) {
                toWord = true;
                k++;
            }
            if (toWord && /^step$/i.test(toks[k] || "")) k++;
            if (/^\d+$/.test(toks[k] || "")) num = +toks[k++];
        }
        while (k < toks.length && ok) {
            const tk = toks[k];
            let m: RegExpMatchArray | null;
            if ((m = tk.match(/^(?:[x×]|max=?)(\d+)$/i))) {
                max = +m[1];
                k++;
            } else if (/^(?:[x×]|max)$/i.test(tk) && /^\d+$/.test(toks[k + 1] || "")) {
                max = +toks[k + 1];
                k += 2;
            } else ok = false;
        }
        const label = body.slice(0, am.index).trim();
        const needsNum = (kind === "back" || toWord) && num === null;
        if (ok && !needsNum) {
            cond.label = label;
            if (kind === "end") {
                cond.action = "end";
                cond.neg = true;
                if (max > 1) warn(ln, "max only works with loop");
            } else if (kind === "next") {
                if (max > 1) warn(ln, "max only works with loop");
            } else {
                cond.action = "loop";
                cond.max = Math.min(9, Math.max(1, max));
                loops.push({ cond, step, num, line: ln });
            }
        } else if (ok) {
            warn(ln, "Give the step number, like -> loop to step 3");
            cond.label = label;
        } else {
            warn(ln, `Cannot read the end of the line "${clip(am[0].trim(), 30)}"; it is kept as part of the name`);
        }
    }
    cond.label = unescapeBracket(cond.label);
    if (!cond.label) warn(ln, "A condition has no name");

    // [P1, variant, negative, sets lv1, needs !master or lv2]
    for (const raw of inner.split(/[,;]/)) {
        const it = raw.trim();
        if (!it) continue;
        let m: RegExpMatchArray | null;
        if (/^p[123]$/i.test(it)) cond.pri = it.slice(1);
        else if (/^variant$/i.test(it)) cond.variant = true;
        else if (/^(negative|neg)$/i.test(it)) cond.neg = true;
        else if (/^distinct$/i.test(it)) cond.distinct = true;
        else if ((m = it.match(/^sets?\s+(.+)$/i))) cond.tags = tagsFromWords(m[1]);
        else if ((m = it.match(/^needs?\s+(.+)$/i))) cond.need = needFromWords(m[1]);
        else
            warn(ln, `Unknown option "${clip(it, 24)}" in [ ]${didYouMean(it.split(/\s+/)[0], BRACKET_WORDS)}`);
    }
    if (cond.distinct && cond.action !== "loop") {
        warn(ln, "distinct only works with loop to step N");
        cond.distinct = false;
    }
    return cond;
}

/* ------------------------------ compact form ------------------------------- */

/** Trailing options of a compact condition: `[P1 tag=x need=y variant max=2]`. */
function takeCompactOptions(
    raw: string,
    where: string,
    warnings: string[]
): { label: string; opts: Partial<Cond> } {
    const m = raw.match(OPTIONS_AT_END);
    if (!m) return { label: unescapeBracket(raw), opts: {} };
    const opts: Partial<Cond> = {};
    m[2]
        .split(/\s+/)
        .filter(Boolean)
        .forEach((tok) => {
            const t = tok.toLowerCase();
            if (/^p[123]$/.test(t)) opts.pri = t.slice(1);
            else if (t === "variant") opts.variant = true;
            else if (/^max=\d+$/.test(t)) opts.max = Math.min(9, Math.max(1, +t.slice(4)));
            else if (t.indexOf("tag=") === 0) opts.tags = tok.slice(4);
            // `|` separates conditions here, so `/` means "or" inside need
            else if (t.indexOf("need=") === 0) opts.need = tok.slice(5).replace(/\//g, "|");
            else
                warnings.push(
                    `${where}: unknown option "${clip(tok, 24)}" in [ ]${didYouMean(t.split("=")[0], ["variant", "max", "tag", "need", "P1", "P2", "P3"])}`
                );
        });
    return { label: unescapeBracket(m[1]), opts };
}

function parseCompact(
    src: string,
    id: () => string,
    warnings: string[]
): { steps: Step[]; mode: Mode | null } {
    // the first word may pick the mode: @ep @all @pair @min
    const sm = src.match(/^\s*@(ep|all|pairwise|pair|min|each)\b\s*/i);
    const mode = sm ? MODE_ALIASES[sm[1].toLowerCase()] : null;
    const txt = sm ? src.slice(sm[0].length) : src;

    const segs = txt
        .split(">")
        .map((s) => s.trim())
        .filter(Boolean);
    const steps: Step[] = [];
    const raw: string[][] = [];
    segs.forEach((seg) => {
        const m = seg.match(/^([^(]*?)\s*\(([\s\S]*)\)\s*$/);
        const name = (m ? m[1] : seg).trim();
        steps.push(newStep(id(), name || "Step"));
        raw.push(
            m
                ? m[2]
                      .split("|")
                      .map((t) => t.trim())
                      .filter(Boolean)
                : []
        );
    });
    steps.forEach((st, i) => {
        raw[i].forEach((t) => {
            let neg = false;
            let flag = "";
            let rest = t;
            if (/^[!-]/.test(rest)) {
                neg = true;
                flag = rest[0];
                rest = rest.slice(1).trim();
            }
            const where = `step ${i + 1} (${clip(st.name, 20)})`;
            const o = takeCompactOptions(rest, where, warnings);
            rest = o.label;
            const lm = rest.match(/^~(\d+)?\s*([\s\S]*)$/);
            let c: Cond;
            if (lm) {
                const ti = lm[1] ? Math.min(Math.max(+lm[1] - 1, 0), steps.length - 1) : i;
                c = Object.assign(
                    newCond(id(), lm[2] || "loop"),
                    { neg, action: "loop" as const, target: steps[ti].id, max: 1 },
                    o.opts
                );
            } else {
                c = Object.assign(
                    newCond(id(), rest),
                    { neg, action: (flag === "!" ? "end" : "next") as "end" | "next" },
                    o.opts
                );
            }
            st.conds.push(c);
        });
    });
    if (!steps.length) warnings.push("No step found");
    return { steps, mode };
}

/* ----------------------------- writing it back ----------------------------- */

const FIELD_START = new RegExp(
    "^(" + [...Object.keys(FIELD_KEYS), ...Object.keys(COND_FIELD_KEYS)].join("|") + ")\\s*:",
    "i"
);

/**
 * A label for a choice line: a `[` that has no `]` after it would be read as the start
 * of the options, and a `[` after a backslash would lose it; both are written `\[`.
 */
const escapeBracket = (label: string) =>
    label.replace(/\[/g, (_m, at: number) => (label.indexOf("]", at) < 0 || label[at - 1] === "\\" ? "\\[" : "["));

/** Would this line be read as structure if it started a line of its own? */
const looksStructural = (t: string) =>
    /^(\d+[.)]\s*|[-*•–]\s|@|#|\/\/|\\)/.test(t) || FIELD_START.test(t);

/**
 * The flow in the blocks form, options and fields included. Reading the result
 * with parseFlowText gives the same flow back.
 */
export function formatFlow(flow: Flow, opts: { title?: string } = {}): string {
    const out: string[] = ["@builder"];
    if (opts.title && opts.title.trim()) out.push("@title " + oneLine(opts.title));
    out.push("");
    const numberOf: Record<string, number> = {};
    flow.steps.forEach((s, i) => {
        numberOf[s.id] = i + 1;
    });

    const field = (indent: string, key: string, value: string | undefined) => {
        const v = (value ?? "").trim();
        if (!v) return;
        const ls = v.split("\n");
        out.push(`${indent}${key}: ${ls[0].trim()}`);
        for (const l of ls.slice(1)) {
            const t = l.trim();
            if (!t) continue;
            out.push(indent + "  " + (looksStructural(t) ? "\\" : "") + t);
        }
    };

    flow.steps.forEach((s, i) => {
        out.push(`${i + 1}. ${oneLine(s.name)}`);
        field("   ", "given", s.pre);
        field("   ", "data", s.data);
        field("   ", "then", s.exp);
        field("   ", "req", s.req);
        for (const c of s.conds) {
            let line = "   - " + escapeBracket(oneLine(c.label));
            if (c.action === "end") line += " -> end";
            else if (c.action === "loop") {
                const n = c.target ? numberOf[c.target] : undefined;
                line += !n || c.target === s.id ? " -> loop" : ` -> loop to step ${n}`;
                if (c.max > 1) line += ` max ${c.max}`;
            }
            const o: string[] = [];
            if (c.pri) o.push("P" + c.pri);
            if (c.variant) o.push("variant");
            if (c.neg && c.action !== "end") o.push("negative");
            if (c.distinct) o.push("distinct");
            if (o.length) line += " [" + o.join(", ") + "]";
            // a label ending in [..] would be read as its options: an empty [] ends it
            else if (/\]\s*$/.test(line)) line += " []";
            out.push(line);
            // sets / needs are fields, before the other fields (SYN-17, SYN-40)
            if (c.need) out.push("     needs: " + needToWords(c.need));
            if (c.tags) out.push("     sets: " + c.tags.split(",").filter(Boolean).join(" "));
            field("     ", "given", c.pre);
            field("     ", "data", c.data);
            field("     ", "then", c.exp);
            field("     ", "req", c.req);
        }
    });
    return out.join("\n") + "\n";
}
