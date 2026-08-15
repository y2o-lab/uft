/// <reference lib="webworker" />

export {};

/** SQLite WASM will be initialized lazily after the initial UI paint. */
self.addEventListener("message", (event: MessageEvent<{ type: "ping" }>) => {
  if (event.data.type === "ping") self.postMessage({ type: "ready" });
});
