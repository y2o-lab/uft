import type { ModelContext, ModelContextTool } from "./types";

export function getModelContext(): ModelContext | null {
  if (!globalThis.isSecureContext || typeof document === "undefined")
    return null;
  try {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    return typeof context?.registerTool === "function" ? context : null;
  } catch {
    return null;
  }
}

/** Aborting the group handles partial failure and a late registration alike. */
export function registerTools(
  context: ModelContext,
  tools: ModelContextTool[],
  onState: (state: "ready" | "failed") => void,
): () => void {
  const controller = new AbortController();
  let disposed = false;
  void (async () => {
    try {
      for (const tool of tools) {
        if (disposed) return;
        await context.registerTool(tool, { signal: controller.signal });
      }
      if (!disposed) onState("ready");
    } catch {
      controller.abort();
      if (!disposed) onState("failed");
    }
  })();
  return () => {
    disposed = true;
    controller.abort();
  };
}
