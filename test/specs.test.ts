// The specs (specs/*.md) are the source of truth. These checks keep them usable as
// one: rule IDs are unique, every rule a test names exists, and the index lists
// every spec file. (TEST-04)

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../specs/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
const read = (f: string) => readFileSync(new URL(f, dir), "utf8");
const PREFIX = { TERM: "00-", UI: "01-", DRV: "02-", CALC: "03-", SYN: "04-", OUT: "05-", TEST: "06-" } as const;
const RULE = /\*\*((TERM|UI|DRV|CALC|SYN|OUT|TEST)-\d{2})\b/g;

/** Rule IDs defined in the specs (written in bold where the rule starts). */
const defined = new Map<string, string>();
for (const f of files)
    for (const m of read(f).matchAll(RULE)) {
        assert.ok(!defined.has(m[1]), `${m[1]} is defined twice: ${defined.get(m[1])} and ${f}`);
        defined.set(m[1], f);
    }

test("TEST-04: rule IDs are unique, and each sits in the file its prefix names", () => {
    assert.ok(defined.size > 100, "rules found: " + defined.size);
    for (const [id, f] of defined) {
        const prefix = id.split("-")[0] as keyof typeof PREFIX;
        assert.ok(f.startsWith(PREFIX[prefix]), `${id} belongs in ${PREFIX[prefix]}*.md, not ${f}`);
    }
});

test("TEST-04: every rule ID named in the tests or the code exists in the specs", () => {
    const sources = [
        ...readdirSync(new URL("../test/", import.meta.url))
            .filter((f) => f.endsWith(".ts"))
            .map((f) => new URL("../test/" + f, import.meta.url)),
        ...readdirSync(new URL("../src/", import.meta.url))
            .filter((f) => f.endsWith(".ts") && f !== "panelHtml.ts")
            .map((f) => new URL("../src/" + f, import.meta.url)),
    ];
    for (const u of sources) {
        const text = readFileSync(u, "utf8");
        for (const m of text.matchAll(/\b((?:TERM|UI|DRV|CALC|SYN|OUT|TEST)-\d{2})\b/g))
            assert.ok(defined.has(m[1]), `${u.pathname.split("/").slice(-2).join("/")} names ${m[1]}, which no spec defines`);
    }
});

test("TEST-04: the spec index lists every spec file, and every rule a spec refers to exists", () => {
    const index = read("README.md");
    for (const f of files) if (f !== "README.md") assert.ok(index.includes(`(${f})`), `specs/README.md lists ${f}`);
    for (const f of files)
        for (const m of read(f).matchAll(/\b((?:TERM|UI|DRV|CALC|SYN|OUT|TEST)-\d{2})\b/g))
            assert.ok(defined.has(m[1]), `${f} refers to ${m[1]}, which is not defined`);
});
