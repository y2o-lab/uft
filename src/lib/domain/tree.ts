import type { EntryKind, Workspace, WorkspaceEntry } from "./workspace";

const invalidName = /[\\/\0]|^\.{1,2}$/;

export class WorkspacePathError extends Error {}

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120 || invalidName.test(trimmed)) {
    throw new WorkspacePathError(
      "名前には /、\\、空文字、.、.. を使用できません。",
    );
  }
  return trimmed;
}

export function normalizePath(path: string): string {
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    normalized
      .split("/")
      .some((part) => !part || part === "." || part === ".." || /\0/.test(part))
  ) {
    throw new WorkspacePathError("安全でないパスです。");
  }
  return normalized;
}

export function childPath(parent: WorkspaceEntry | null, name: string): string {
  return normalizePath(
    parent ? `${parent.path}/${validateName(name)}` : validateName(name),
  );
}

export function activeEntries(workspace: Workspace): WorkspaceEntry[] {
  return workspace.entries.filter((entry) => !entry.deletedAt);
}

export function findEntry(workspace: Workspace, id: string): WorkspaceEntry {
  const entry = activeEntries(workspace).find(
    (candidate) => candidate.id === id,
  );
  if (!entry) throw new WorkspacePathError("項目が見つかりません。");
  return entry;
}

export function siblings(
  workspace: Workspace,
  parentId: string | null,
  exceptId?: string,
): WorkspaceEntry[] {
  return activeEntries(workspace).filter(
    (entry) => entry.parentId === parentId && entry.id !== exceptId,
  );
}

export function assertNoCollision(
  workspace: Workspace,
  parentId: string | null,
  name: string,
  exceptId?: string,
): void {
  const candidate = validateName(name).toLocaleLowerCase();
  if (
    siblings(workspace, parentId, exceptId).some(
      (entry) => entry.name.toLocaleLowerCase() === candidate,
    )
  ) {
    throw new WorkspacePathError("同じフォルダに同名の項目があります。");
  }
}

export function assertParent(
  workspace: Workspace,
  parentId: string | null,
): WorkspaceEntry | null {
  if (!parentId) return null;
  const parent = findEntry(workspace, parentId);
  if (parent.kind !== "folder")
    throw new WorkspacePathError("保存先はフォルダである必要があります。");
  return parent;
}

export function descendants(
  workspace: Workspace,
  entryId: string,
): WorkspaceEntry[] {
  const byParent = new Map<string | null, WorkspaceEntry[]>();
  for (const entry of activeEntries(workspace)) {
    const list = byParent.get(entry.parentId) ?? [];
    list.push(entry);
    byParent.set(entry.parentId, list);
  }
  const result: WorkspaceEntry[] = [];
  const visit = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      result.push(child);
      visit(child.id);
    }
  };
  visit(entryId);
  return result;
}

export function canMoveEntry(
  workspace: Workspace,
  entryId: string,
  parentId: string | null,
): boolean {
  if (entryId === parentId) return false;
  return !descendants(workspace, entryId).some(
    (entry) => entry.id === parentId,
  );
}

export function recomputeDescendantPaths(
  workspace: Workspace,
  entry: WorkspaceEntry,
): void {
  for (const child of activeEntries(workspace).filter(
    (candidate) => candidate.parentId === entry.id,
  )) {
    child.path = childPath(entry, child.name);
    recomputeDescendantPaths(workspace, child);
  }
}

export function orderedChildren(
  workspace: Workspace,
  parentId: string | null,
): WorkspaceEntry[] {
  return siblings(workspace, parentId).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export function defaultName(kind: EntryKind): string {
  return kind === "folder"
    ? "New folder"
    : kind === "diagram"
      ? "New diagram"
      : "untitled.md";
}
