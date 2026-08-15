import anydocWasmUrl from "@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url";

type AnyDocFormat =
  | "doc"
  | "docx"
  | "odt"
  | "pdf"
  | "ppt"
  | "pptx"
  | "rtf"
  | "epub"
  | "xlsx"
  | "ods"
  | "odp"
  | "csv";

type ConvertRequest = {
  type: "convert";
  id: string;
  bytes: ArrayBuffer;
  format: AnyDocFormat;
};

type ConvertErrorCode =
  | "unsupported"
  | "malformed"
  | "encrypted"
  | "resourceLimit"
  | "missingPart"
  | "unknown";

type NormalizedError = { code: ConvertErrorCode; message: string };

type ConvertResponse =
  | { id: string; ok: true; markdown: string }
  | {
      id: string;
      ok: false;
      error: NormalizedError;
    };

type AnyDocModule = {
  default: (options?: { module_or_path: string }) => Promise<unknown>;
  toMarkdownBytes: (bytes: Uint8Array, format: AnyDocFormat) => string;
};

let anydoc: Promise<AnyDocModule> | undefined;

async function loadAnyDoc(): Promise<AnyDocModule> {
  if (!anydoc) {
    anydoc = import("@firecrawl/anydoc-wasm").then(async (module) => {
      const loaded = module as unknown as AnyDocModule;
      await loaded.default({ module_or_path: anydocWasmUrl });
      return loaded;
    });
  }
  return anydoc;
}

function normalizeError(error: unknown): NormalizedError {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = candidate?.code;
  const supportedCodes = new Set<ConvertErrorCode>([
    "unsupported",
    "malformed",
    "encrypted",
    "resourceLimit",
    "missingPart",
  ]);
  return {
    code:
      typeof code === "string" && supportedCodes.has(code as ConvertErrorCode)
        ? (code as ConvertErrorCode)
        : "unknown",
    message:
      typeof candidate?.message === "string"
        ? candidate.message
        : "文書を Markdown に変換できませんでした。",
  };
}

self.addEventListener(
  "message",
  async (event: MessageEvent<ConvertRequest>) => {
    const request = event.data;
    if (request.type !== "convert") return;
    try {
      const module = await loadAnyDoc();
      const markdown = module.toMarkdownBytes(
        new Uint8Array(request.bytes),
        request.format,
      );
      const response: ConvertResponse = { id: request.id, ok: true, markdown };
      self.postMessage(response);
    } catch (error) {
      const response: ConvertResponse = {
        id: request.id,
        ok: false,
        error: normalizeError(error),
      };
      self.postMessage(response);
    }
  },
);
