import type { DriverModule } from "@drawdy/driver-protocol";
import { ICON_PNG_DATA_URI } from "./iconData";
import { initHost, isBusy, note, run, setBusy } from "./host";
import { WV_ID, openWebview, setStyling, themeCss, toPanel, wvError } from "./webview";
import { onPanelMessage, resetNoteState } from "./panelMessages";
import { onPlacementEvent, resetPlacement } from "./placement";

/**
 * E2E Scenario Builder.
 *
 * The extension's button (right edge of the board) opens a webview panel: a
 * text box for the flow, a mode switch, live scenario counts, and buttons that
 * draw the flow and its test scenarios on the board.
 *
 *   host.ts          the command channel, ids, busy flag, status notes
 *   webview.ts       opening the panel, theme, messages to the panel
 *   panelMessages.ts messages from the panel (preview, target, buttons)
 *   actions.ts       what each button does
 *   drawing.ts       flow diagram, scenario frame and table on the board
 *   selection.ts     reading the selection, free-space search
 *   placement.ts     where drawings go: free space, or held for a click
 */

const BTN = "purrcat101.e2e-scenario-builder:button";

/** The toolbar button takes an svg only, so the logo is embedded as an <image>. */
const ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    `<image href="${ICON_PNG_DATA_URI}" width="24" height="24"/>` +
    "</svg>";

/** The toolbar button: open the panel (or say why it cannot be opened). */
async function toggleMenu() {
    if (await openWebview()) return;
    const vp = await run("command:camera:get-viewport-rect", undefined);
    const r = vp.value?.rect ?? { x: 0, y: 0, width: 1400, height: 900 };
    await note(
        "Could not open the extension window\n\n" + wvError +
            "\n\nCheck that the permissions the extension asks for (dom, scene) are allowed",
        r.x + 40,
        r.y + 40,
        "red"
    );
}

export const activate: DriverModule["activate"] = async (ctx) => {
    resetNoteState();
    resetPlacement();
    initHost(ctx);
    setStyling(ctx.styling);

    await run("command:dom:create-action-button", {
        domElementId: BTN,
        svg: ICON,
    });
    await run("subscription:dom:element-clicked", { domElementId: BTN });
    await run("subscription:webview:message", { webviewDomId: WV_ID });
    await run("subscription:dom:theme-changed", undefined);
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    if (await onPlacementEvent(event)) return;
    if (event.type === "subscription:dom:theme-changed") {
        setStyling(event.body.styling);
        const m = { type: "theme", css: themeCss() };
        await toPanel(m);
        return;
    }
    if (event.type === "subscription:webview:message") {
        if (event.body.webviewDomId === WV_ID) {
            try {
                await onPanelMessage(event.body.message);
            } catch (e) {
                await toPanel({ type: "status", text: "Error: " + String(e), bad: true });
            }
        }
        return;
    }
    if (
        event.type !== "subscription:dom:element-clicked" ||
        event.body.domElementId !== BTN
    ) {
        return;
    }
    if (isBusy()) return;
    setBusy(true);
    try {
        await toggleMenu();
    } catch (e) {
        await note(`Unexpected error\n${String(e)}`, 0, 0, "red");
    } finally {
        setBusy(false);
    }
};
