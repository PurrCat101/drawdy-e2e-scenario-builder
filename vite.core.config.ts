// Builds the core (src/core) alone, as one ES module for a web page or a web worker:
//   npm run build:core   ->   dist-core/e2e-core.js
// The extension is built by `npm run build` and does not use this.

import { defineConfig } from "vite";

export default defineConfig({
    appType: "custom",
    build: {
        outDir: "dist-core",
        emptyOutDir: true,
        target: "es2022",
        minify: false,
        lib: {
            entry: "src/core/index.ts",
            formats: ["es"],
            fileName: () => "e2e-core.js",
        },
    },
});
