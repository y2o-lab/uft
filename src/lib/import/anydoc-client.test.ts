import { describe, expect, it } from "vitest";
import { AnyDocClient } from "./anydoc-client";

class ThrowingWorker extends EventTarget {
  postMessage(): void {
    throw new Error("Worker is unavailable");
  }

  terminate(): void {}
}

describe("AnyDocClient", () => {
  it("rejects immediately when a conversion request cannot be sent", async () => {
    const client = new AnyDocClient(
      () => new ThrowingWorker() as unknown as Worker,
    );
    const file = {
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;

    await expect(client.convert(file, "csv")).rejects.toThrow(
      "Worker is unavailable",
    );
    client.dispose();
  });
});
