import type { Workspace } from "../domain/workspace";
import { CommandError } from "./types";

export function documentVersion(
  workspace: Workspace | undefined,
  entryId: string,
) {
  const entry = workspace?.entries.find((item) => item.id === entryId);
  const doc = workspace?.documents[entryId];
  return entry && doc
    ? {
        revision: doc.revision,
        updatedAt: doc.updatedAt,
        content: doc.content,
        deletedAt: entry.deletedAt,
        entryUpdatedAt: entry.updatedAt,
        kind: entry.kind,
        workspaceId: entry.workspaceId,
      }
    : null;
}
export function sameVersion(
  left: ReturnType<typeof documentVersion>,
  right: ReturnType<typeof documentVersion>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function versionToken(
  local: Workspace,
  persisted: Workspace | undefined,
  entryId: string,
): Promise<string> {
  return digest({
    workspaceId: local.id,
    entryId,
    local: documentVersion(local, entryId),
    persisted: documentVersion(persisted, entryId),
  });
}
export function markdownEntry(workspace: Workspace, entryId: string) {
  const entry = workspace.entries.find(
    (item) =>
      item.id === entryId &&
      item.workspaceId === workspace.id &&
      !item.deletedAt &&
      item.kind === "markdown",
  );
  if (!entry || !workspace.documents[entryId])
    throw new CommandError("NOT_FOUND");
  return entry;
}
export function contentRange(content: string, offset: number, limit: number) {
  let start = Math.min(offset, content.length);
  if (
    start > 0 &&
    isLow(content.charCodeAt(start)) &&
    isHigh(content.charCodeAt(start - 1))
  )
    start--;
  let end = Math.min(start + limit, content.length);
  if (
    end < content.length &&
    isHigh(content.charCodeAt(end - 1)) &&
    isLow(content.charCodeAt(end))
  )
    end--;
  // A one-unit request must still advance across an astral character.
  if (end === start && start < content.length)
    end = Math.min(start + 2, content.length);
  return {
    content: content.slice(start, end),
    offset: start,
    endOffset: end,
    totalLength: content.length,
    nextOffset: end < content.length ? end : null,
  };
}
const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;
