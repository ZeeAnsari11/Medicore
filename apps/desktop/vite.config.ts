import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Same root cause as the build.commonjsOptions widening below, but for `vite dev`:
  // these workspace packages resolve through a pnpm symlink to a path outside any
  // node_modules dir, so Vite's dev-server dependency optimizer (which only pre-bundles
  // — and CJS-to-ESM converts — deps whose resolved real path is under node_modules)
  // skips them and serves their compiled CommonJS output as-is. A browser ES module
  // can't execute that (`exports is not defined`), which aborted the app's import chain
  // before React ever rendered. Explicit `include` forces pre-bundling regardless of path.
  optimizeDeps: {
    include: ["@medicore/api-client", "@medicore/shared-types"],
  },

  // pnpm workspace packages resolve through a symlink to a path outside any
  // node_modules dir, so Rollup's commonjs plugin (default include: node_modules
  // only) never sees their CJS output as needing interop. Widen it explicitly.
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\//],
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
