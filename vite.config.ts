import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, loadEnv } from "vite";
import { webMcpOriginTrial } from "./src/lib/webmcp/origin-trial";

export default defineConfig(({ mode }) => ({
  plugins: [
    svelte(),
    webMcpOriginTrial(loadEnv(mode, ".", "WEBMCP_").WEBMCP_ORIGIN_TRIAL_TOKENS),
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  worker: { format: "es" },
}));
