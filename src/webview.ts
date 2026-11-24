import type { ModuleStyling } from "@drawdy/driver-protocol";
import { PANEL_HTML } from "./panelHtml";
import { run } from "./host";

/**
 * The panel: an HTML page in a webview, opened from the toolbar button. It talks
 * to the driver with postMessage (see panelMessages.ts).
 */

/** Drawdy's theme, as CSS variables for the pages in the webviews. */
let styling: ModuleStyling | null = null;
export const setStyling = (s: ModuleStyling | null) => {
    styling = s;
};
const THEME_MARK = "/*__DRAWDY_STYLING__*/";
export function themeCss(): string {
    if (!styling) return "";
    const vars = Object.entries(styling.tokens ?? {})
        .map(([k, v]) => `${k}:${v};`)
        .join("");
    return `:root{${vars}color-scheme:${styling.theme};}`;
}

export const WV_ID = "purrcat101.e2e-scenario-builder:panel";
export let wvError = "";

export async function openWebview(): Promise<boolean> {
    const r = await run("command:webview:create", {
        webviewDomId: WV_ID,
        htmlContent: PANEL_HTML.replace(THEME_MARK, () => themeCss()),
        keepStateWhenClosed: true,
    });
    wvError = r.error ?? "";
    return !r.error;
}

/** Send a message to the panel's page. */
export async function toPanel(message: unknown) {
    await run("command:webview:post-message", { webviewDomId: WV_ID, message });
}
