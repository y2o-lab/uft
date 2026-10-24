import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@firecrawl/anydoc-wasm", () => ({
  default: vi.fn(async () => undefined),
  toMarkdownBytes: vi.fn(() => "# Converted"),
}));

vi.mock("@sqlite.org/sqlite-wasm", () => ({
  default: async () => ({
    oo1: {
      DB: class {
        exec() {
          return [];
        }
      },
    },
  }),
}));

describe.each([
  {
    name: "document conversion",
    load: () => import("./import/anydoc.worker"),
    request: {
      type: "convert",
      id: "convert-1",
      bytes: new ArrayBuffer(0),
      format: "csv",
    },
    response: { id: "convert-1", ok: true, markdown: "# Converted" },
  },
  {
    name: "workspace storage",
    load: () => import("./storage/workspace.worker"),
    request: { id: "list-1", method: "list" },
    response: { id: "list-1", ok: true, result: [] },
  },
])("$name Worker messages", ({ load, request, response }) => {
  const addEventListener = vi.fn();
  const postMessage = vi.fn();
  let handleMessage: (event: Partial<MessageEvent>) => unknown;

  beforeEach(async () => {
    vi.resetModules();
    addEventListener.mockClear();
    postMessage.mockClear();
    vi.stubGlobal("self", { addEventListener, postMessage });
    await load();
    handleMessage = addEventListener.mock.calls[0][1];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { origin: "https://untrusted.example", isTrusted: true },
    { origin: "null", isTrusted: true },
    { origin: "", isTrusted: false },
  ])(
    "rejects an invalid message %j before reading its payload",
    async (event) => {
      await handleMessage({
        ...event,
        get data() {
          throw new Error("Rejected messages must not be processed");
        },
      });

      expect(postMessage).not.toHaveBeenCalled();
    },
  );

  it("processes a browser-delivered message from the private Worker port", async () => {
    await handleMessage({ origin: "", isTrusted: true, data: request });

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledExactlyOnceWith(response);
    });
  });
});
