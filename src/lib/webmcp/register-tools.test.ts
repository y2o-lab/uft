import { expect, it, vi } from "vitest";
import { registerTools } from "./register-tools";
import type { ModelContextTool } from "./types";

const tool = (name: string): ModelContextTool => ({
  name,
  description: "test",
  inputSchema: {},
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async () => ({ ok: true, data: {} }),
});
it("cleans up a partially failed registration", async () => {
  const signals: AbortSignal[] = [];
  const onState = vi.fn();
  const dispose = registerTools(
    {
      registerTool: async (_tool, options) => {
        if (!options) throw new Error("missing registration signal");
        signals.push(options.signal);
        if (signals.length === 2) throw new Error("registration failure");
      },
    },
    [tool("one"), tool("two")],
    onState,
  );
  await vi.waitFor(() => expect(onState).toHaveBeenCalledWith("failed"));
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  dispose();
});
it("aborts a registration completed after disposal and never marks it ready", async () => {
  let finish: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  const onState = vi.fn();
  const registered = vi.fn();
  const dispose = registerTools(
    {
      registerTool: (_tool, options) => {
        registered();
        signal = options?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    [tool("one"), tool("two")],
    onState,
  );
  dispose();
  finish?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(signal?.aborted).toBe(true);
  expect(registered).toHaveBeenCalledTimes(1);
  expect(onState).not.toHaveBeenCalled();
});
