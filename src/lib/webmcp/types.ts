/** Minimal September 2026 Document API; no navigator fallback or polyfill. */
export type ToolResult =
  | { ok: true; data: Record<string, unknown>; replayed?: boolean }
  | { ok: false; error: { code: string; message: string } };

export type ModelContextTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
    consequentialHint?: boolean;
  };
  execute: (
    input: unknown,
    options?: { signal: AbortSignal },
  ) => Promise<ToolResult>;
};
export type ModelContext = {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal: AbortSignal },
  ) => Promise<void>;
};
export class CommandError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const messages: Record<string, string> = {
  INVALID_INPUT: "入力の型・対象・サイズを確認してください。",
  WORKSPACE_CHANGED: "ワークスペースが変更されました。",
  NOT_READY: "AI 連携が利用可能になるまで待ってください。",
  NOT_FOUND: "Markdown 文書が見つかりません。",
  CONFLICT: "文書が変更されました。再読み取りしてください。",
  BUSY: "別の操作が完了するまで待ってください。",
  CANCELLED: "操作をキャンセルしました。",
  SAVE_FAILED: "保存できませんでした。同じ requestId で再試行できます。",
  REQUEST_ID_REUSED: "requestId が異なる入力に使用されています。",
};
export function failure(error: unknown): ToolResult {
  const code = error instanceof CommandError ? error.code : "SAVE_FAILED";
  return { ok: false, error: { code, message: messages[code] } };
}
