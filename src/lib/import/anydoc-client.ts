export type DocumentFormat =
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

export type ConversionErrorCode =
  | "unsupported"
  | "malformed"
  | "encrypted"
  | "resourceLimit"
  | "missingPart"
  | "unknown";

export class DocumentConversionError extends Error {
  constructor(
    message: string,
    readonly code: ConversionErrorCode,
  ) {
    super(message);
    this.name = "DocumentConversionError";
  }
}

type WorkerResponse =
  | { id: string; ok: true; markdown: string }
  | {
      id: string;
      ok: false;
      error: { code: ConversionErrorCode; message: string };
    };

type PendingRequest = {
  resolve: (markdown: string) => void;
  reject: (error: Error) => void;
  abort: () => void;
};

export class AnyDocClient {
  #worker: Worker;
  #pending = new Map<string, PendingRequest>();

  constructor(
    createWorker = () =>
      new Worker(new URL("./anydoc.worker.ts", import.meta.url), {
        type: "module",
      }),
  ) {
    this.#worker = createWorker();
    this.#worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        const pending = this.#pending.get(event.data.id);
        if (!pending) return;
        this.#pending.delete(event.data.id);
        if (event.data.ok) pending.resolve(event.data.markdown);
        else
          pending.reject(
            new DocumentConversionError(
              event.data.error.message,
              event.data.error.code,
            ),
          );
      },
    );
    this.#worker.addEventListener("error", (event) => {
      const error = new DocumentConversionError(
        event.message || "変換 Worker の起動に失敗しました。",
        "unknown",
      );
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    });
  }

  async convert(
    file: File,
    format: DocumentFormat,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted) throw abortError();
    const bytes = await file.arrayBuffer();
    if (signal?.aborted) throw abortError();
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return new Promise<string>((resolve, reject) => {
      const onAbort = () => {
        this.#pending.delete(id);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#pending.set(id, {
        resolve: (markdown) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(markdown);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        },
        abort: onAbort,
      });
      this.#worker.postMessage({ type: "convert", id, bytes, format }, [bytes]);
    });
  }

  dispose(): void {
    for (const pending of this.#pending.values()) pending.abort();
    this.#pending.clear();
    this.#worker.terminate();
  }
}

function abortError(): DOMException {
  return new DOMException("文書の変換をキャンセルしました。", "AbortError");
}
