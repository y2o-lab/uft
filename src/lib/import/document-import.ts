import { activeEntries } from "../domain/tree";
import type { Workspace, WorkspaceEntry } from "../domain/workspace";
import { createEntry, updateDocument } from "../workspace/workspace-service";
import type { DocumentFormat } from "./anydoc-client";

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_TOTAL_BYTES = 200 * 1024 * 1024;

const formatByExtension: Record<string, DocumentFormat> = {
  doc: "doc",
  docx: "docx",
  docm: "docx",
  ppt: "ppt",
  pps: "ppt",
  pot: "ppt",
  pptx: "pptx",
  pptm: "pptx",
  ppsx: "pptx",
  ppsm: "pptx",
  xls: "xlsx",
  xlsx: "xlsx",
  xlsm: "xlsx",
  xlsb: "xlsx",
  odt: "odt",
  ods: "ods",
  odp: "odp",
  rtf: "rtf",
  epub: "epub",
  csv: "csv",
  pdf: "pdf",
};

const allowedMimeTypes: Record<DocumentFormat, string[]> = {
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-word.document.macroenabled.12",
  ],
  odt: ["application/vnd.oasis.opendocument.text"],
  pdf: ["application/pdf"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  ],
  rtf: ["application/rtf", "text/rtf"],
  epub: ["application/epub+zip"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroenabled.12",
    "application/vnd.ms-excel.sheet.binary.macroenabled.12",
    "application/vnd.ms-excel",
  ],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  csv: ["text/csv", "application/csv", "text/plain"],
};

export const documentAccept = Object.keys(formatByExtension)
  .map((extension) => `.${extension}`)
  .join(",");

export type DocumentFile = Pick<File, "name" | "size" | "type" | "arrayBuffer">;

export type FileValidation =
  | { valid: true; format: DocumentFormat }
  | { valid: false; reason: string };

export type ImportProgress = {
  completed: number;
  total: number;
  currentName?: string;
};

export type ImportResult = {
  file: DocumentFile;
  status: "imported" | "failed" | "cancelled";
  entry?: WorkspaceEntry;
  reason?: string;
};

export function extensionOf(name: string): string | null {
  const match = /\.([^.]+)$/.exec(name.trim());
  return match ? match[1].toLocaleLowerCase() : null;
}

export function validateDocumentFile(file: DocumentFile): FileValidation {
  const extension = extensionOf(file.name);
  const format = extension ? formatByExtension[extension] : undefined;
  if (!format)
    return {
      valid: false,
      reason: "この形式は変換できません。対応する文書形式を選択してください。",
    };
  if (!file.size)
    return { valid: false, reason: "空のファイルは変換できません。" };
  if (
    file.type &&
    !allowedMimeTypes[format].includes(file.type.toLocaleLowerCase())
  )
    return {
      valid: false,
      reason: "ファイルの形式と種類が一致しません。拡張子を確認してください。",
    };
  if (file.size > MAX_DOCUMENT_BYTES)
    return {
      valid: false,
      reason: `1 ファイルは ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB 以下にしてください。`,
    };
  return { valid: true, format };
}

export function validateDocumentFiles(files: DocumentFile[]): FileValidation[] {
  let total = 0;
  return files.map((file) => {
    const validation = validateDocumentFile(file);
    total += file.size;
    if (total > MAX_DOCUMENT_TOTAL_BYTES)
      return {
        valid: false,
        reason: `選択したファイルの合計は ${MAX_DOCUMENT_TOTAL_BYTES / 1024 / 1024} MB 以下にしてください。`,
      };
    return validation;
  });
}

export function importFileName(sourceName: string): string {
  const extension = extensionOf(sourceName);
  const base = extension
    ? sourceName.slice(0, -(extension.length + 1))
    : sourceName;
  const safe = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._() -]+/gu, "-")
    .replace(/[. ]+$/g, "")
    .replace(/-+/g, "-")
    .trim();
  return `${safe || "imported-document"}.md`;
}

export function nextImportName(
  sourceName: string,
  existingNames: Iterable<string>,
): string {
  const used = new Set(
    Array.from(existingNames, (name) => name.toLocaleLowerCase()),
  );
  const candidate = importFileName(sourceName);
  if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  const stem = candidate.slice(0, -3);
  let index = 2;
  while (used.has(`${stem}-${index}.md`.toLocaleLowerCase())) index += 1;
  return `${stem}-${index}.md`;
}

export function ensureImportsFolder(workspace: Workspace): WorkspaceEntry {
  const existing = activeEntries(workspace).find(
    (entry) => entry.path === "imports",
  );
  if (existing?.kind === "folder") return existing;
  if (existing)
    throw new Error("ルートの「imports」はフォルダである必要があります。");
  return createEntry(workspace, "folder", null, "imports");
}

export function addImportedDocument(
  workspace: Workspace,
  sourceName: string,
  markdown: string,
): WorkspaceEntry {
  const folder = ensureImportsFolder(workspace);
  const name = nextImportName(
    sourceName,
    activeEntries(workspace)
      .filter((entry) => entry.parentId === folder.id)
      .map((entry) => entry.name),
  );
  const entry = createEntry(workspace, "markdown", folder.id, name);
  updateDocument(workspace, entry.id, markdown);
  return entry;
}

export function importErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (code === "unsupported")
    return "この文書は変換できません。PDF はテキストを含むものだけに対応しています。";
  if (code === "encrypted") return "パスワード保護された文書は変換できません。";
  if (code === "malformed" || code === "missingPart")
    return "文書が破損しているか、読み取れる内容がありません。";
  if (code === "resourceLimit")
    return "文書が大きすぎるか複雑すぎるため変換できません。";
  if (error instanceof Error && error.message) return error.message;
  return "文書を Markdown に変換できませんでした。";
}

export async function importDocuments(options: {
  workspace: Workspace;
  files: DocumentFile[];
  convert: (
    file: File,
    format: DocumentFormat,
    signal: AbortSignal,
  ) => Promise<string>;
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
}): Promise<ImportResult[]> {
  const validations = validateDocumentFiles(options.files);
  const results: ImportResult[] = [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    for (const [index, file] of options.files.entries()) {
      if (controller.signal.aborted) {
        results.push({
          file,
          status: "cancelled",
          reason: "キャンセルしました。",
        });
        continue;
      }
      options.onProgress?.({
        completed: index,
        total: options.files.length,
        currentName: file.name,
      });
      const validation = validations[index];
      if (!validation?.valid) {
        results.push({ file, status: "failed", reason: validation?.reason });
        continue;
      }
      try {
        const markdown = await options.convert(
          file as File,
          validation.format,
          controller.signal,
        );
        if (controller.signal.aborted) {
          results.push({
            file,
            status: "cancelled",
            reason: "キャンセルしました。",
          });
          continue;
        }
        results.push({
          file,
          status: "imported",
          entry: addImportedDocument(options.workspace, file.name, markdown),
        });
      } catch (error) {
        results.push({
          file,
          status: controller.signal.aborted ? "cancelled" : "failed",
          reason: controller.signal.aborted
            ? "キャンセルしました。"
            : importErrorMessage(error),
        });
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    options.onProgress?.({
      completed: options.files.length,
      total: options.files.length,
    });
  }
  return results;
}
