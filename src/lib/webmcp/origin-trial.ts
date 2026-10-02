import type { Plugin } from "vite";

/** Tokens are public, origin-bound values; Chrome validates signature/expiry. */
export function webMcpOriginTrial(tokens: string | undefined): Plugin {
  const values = [...new Set((tokens ?? "").split(/[\s,]+/).filter(Boolean))];
  return {
    name: "uft-webmcp-origin-trial",
    transformIndexHtml() {
      return values.map((content) => ({
        tag: "meta",
        attrs: { "http-equiv": "origin-trial", content },
        injectTo: "head-prepend" as const,
      }));
    },
  };
}
