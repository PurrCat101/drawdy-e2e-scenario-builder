// Draws a decision table on the board as plain elements (text boxes with a fill), so
// the writer can move them, add a column or write a note beside them: unlike a table
// in an embedded page, they can be edited on the board (OUT-60 and the rules after it).

import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { columnName, decisionToTsv, type DecisionTable } from "./decisionTable";
import { fitHeight, textBox, type Tone } from "./textBox";

const FONT = 13;
const PAD = 40;
const LABEL_W = 230;
const COMBO_W = 270;
const COL_W = 150; // wide enough for "Test Scenario 12" on one line
const GAP = 8;
const CHIP_H = 34;
const BAR_H = 28;
const X_W = 48;
const X_H = 28;
const ROW_GAP = 6;
const GROUP_GAP = 22;
const FRAME_GAP = 80;
/** Most scenario columns in one frame; more are drawn in more frames, one under the other. */
export const COLUMNS_PER_TABLE = 10;

export type DecisionOut = {
    frameIds: string[];
    elements: DrawdyElementSchema[];
    width: number;
    height: number;
};

type Group = { title: string; tone: Tone; rows: { text: string; marks: boolean[] }[] };

export function renderDecisionTables(opts: {
    table: DecisionTable;
    /** the name of the frames, before ` · N scenarios` or ` · Test Scenario a to b of N` */
    name: string;
    origin: [number, number];
    generateId: () => string;
}): DecisionOut {
    const { table: t, generateId } = opts;
    const [ox, oy] = opts.origin;
    const n = t.columns.length;
    const chunks: [number, number][] = [];
    for (let a = 0; a < n; a += COLUMNS_PER_TABLE) chunks.push([a, Math.min(n, a + COLUMNS_PER_TABLE)]);

    // the rows: a group for each condition
    const groups: Group[] = t.conditions.map((cd, ci) => ({
        title: `${cd.step + 1}. ${cd.name}`,
        tone: "purple",
        rows: cd.values.map((v, vi) => ({ text: v.label, marks: t.marks[ci][vi] })),
    }));

    const elements: DrawdyElementSchema[] = [];
    const frameIds: string[] = [];
    const meta = { e2eDecision: true, scenarios: n, tsv: decisionToTsv(t) };
    let y0 = oy;
    let width = 0;

    chunks.forEach(([a, b]) => {
        const frameId = generateId();
        frameIds.push(frameId);
        const cols = b - a;
        const xLabel = ox + PAD;
        const xCombo = xLabel + LABEL_W + GAP;
        const xCol = xCombo + COMBO_W + GAP;
        const colX = (k: number) => xCol + (k - a) * (COL_W + GAP);
        const innerW = LABEL_W + GAP + COMBO_W + GAP + cols * (COL_W + GAP) - GAP;
        const body: DrawdyElementSchema[] = [];
        const chip = (
            x: number, y: number, w: number, h: number, text: string, tone: Tone,
            align: "left" | "center" = "left", fontSize = FONT
        ) =>
            body.push(
                textBox({ id: generateId(), frameId, x, y, width: w, height: h, text, fontSize, tone, align, valign: "middle" })
            );
        let y = y0 + PAD;

        // the group bars: Success over the Happy columns, Negative over the Negative ones
        const bar = (from: number, to: number, text: string, tone: Tone) => {
            if (to > from) chip(colX(from), y, (to - from) * (COL_W + GAP) - GAP, BAR_H, text, tone, "center", 12);
        };
        bar(a, Math.min(b, t.success), "Success", "green");
        bar(Math.max(a, t.success), b, "Negative", "red");
        y += BAR_H + GAP;
        for (let k = a; k < b; k++) chip(colX(k), y, COL_W, CHIP_H, columnName(k), "violet", "center");
        chip(xLabel, y, LABEL_W, CHIP_H, "Condition", "purple");
        chip(xCombo, y, COMBO_W, CHIP_H, "Combinations", "gray");
        y += CHIP_H + 18;

        for (const g of groups) {
            const labelH = Math.max(CHIP_H, fitHeight(g.title, LABEL_W, FONT));
            const rowHs = g.rows.map((r) => Math.max(CHIP_H, fitHeight(r.text, COMBO_W, FONT)));
            const rowsH = rowHs.reduce((s, h) => s + h, 0) + ROW_GAP * (rowHs.length - 1);
            chip(xLabel, y, LABEL_W, labelH, g.title, g.tone);
            let ry = y;
            g.rows.forEach((r, i) => {
                chip(xCombo, ry, COMBO_W, rowHs[i], r.text, "gray");
                for (let k = a; k < b; k++)
                    if (r.marks[k]) chip(colX(k) + (COL_W - X_W) / 2, ry + (rowHs[i] - X_H) / 2, X_W, X_H, "X", "violet", "center");
                ry += rowHs[i] + ROW_GAP;
            });
            y += Math.max(rowsH, labelH) + GROUP_GAP;
        }

        const frameW = PAD * 2 + innerW;

        const frameH = y - GROUP_GAP + PAD - y0;
        const range = chunks.length > 1 ? ` · ${columnName(a)} to ${b} of ${n}` : ` · ${n} scenarios`;
        elements.push({
            type: "frame",
            drawdyElementId: frameId,
            name: opts.name + range,
            position: [ox, y0],
            width: frameW,
            height: frameH,
            rotation: 0,
            meta,
        } as DrawdyElementSchema);
        elements.push(...body);
        width = Math.max(width, frameW);
        y0 += frameH + FRAME_GAP;
    });

    return { frameIds, elements, width, height: y0 - FRAME_GAP - oy };
}
