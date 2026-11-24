// Which spec rules no test names yet. Run with `npm run spec:coverage`.
// A rule counts as tested when its ID appears in a test file (a title or a comment);
// see specs/README.md. This is a report, not a gate: some rules (layout, wording) are
// checked by hand in Drawdy.

import { readdirSync, readFileSync } from "node:fs";

const RULE = /\*\*((?:TERM|UI|DRV|CALC|SYN|OUT|TEST)-\d{2})\*\*([^\n]*)/g;
const ID = /\b((?:TERM|UI|DRV|CALC|SYN|OUT|TEST)-\d{2})\b/g;

const rules = [];
for (const f of readdirSync("specs").filter((f) => f.endsWith(".md")).sort())
    for (const m of readFileSync("specs/" + f, "utf8").matchAll(RULE))
        rules.push({ id: m[1], file: f, text: m[2].replace(/\s+/g, " ").trim().slice(0, 70) });

const named = new Set();
for (const f of readdirSync("test").filter((f) => f.endsWith(".ts")))
    for (const m of readFileSync("test/" + f, "utf8").matchAll(ID)) named.add(m[1]);

const missing = rules.filter((r) => !named.has(r.id));
// glossary words and the testing rules themselves are not behaviour to test
const relevant = missing.filter((r) => !/^(TERM|TEST)-/.test(r.id));
const counted = rules.filter((r) => !/^(TERM|TEST)-/.test(r.id));
console.log(`Rules named by a test: ${counted.length - relevant.length} of ${counted.length} (TERM and TEST rules left out)\n`);
let last = "";
for (const r of relevant) {
    if (r.file !== last) console.log((last ? "\n" : "") + r.file);
    last = r.file;
    console.log(`  ${r.id}  ${r.text}`);
}
