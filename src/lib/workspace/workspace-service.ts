import {
  assertNoCollision,
  assertParent,
  canMoveEntry,
  childPath,
  defaultName,
  findEntry,
  recomputeDescendantPaths,
} from "../domain/tree";
import {
  type DiagramDocument,
  type EntryKind,
  newId,
  type Workspace,
  type WorkspaceEntry,
} from "../domain/workspace";

const now = () => new Date().toISOString();

function touch(workspace: Workspace): void {
  workspace.updatedAt = now();
}

export function createEntry(
  workspace: Workspace,
  kind: EntryKind,
  parentId: string | null,
  requestedName = defaultName(kind),
): WorkspaceEntry {
  const parent = assertParent(workspace, parentId);
  const name = requestedName.trim() || defaultName(kind);
  assertNoCollision(workspace, parentId, name);
  const timestamp = now();
  const entry: WorkspaceEntry = {
    id: newId(kind),
    workspaceId: workspace.id,
    parentId,
    kind,
    name,
    path: childPath(parent, name),
    sortOrder: workspace.entries.filter(
      (candidate) => candidate.parentId === parentId && !candidate.deletedAt,
    ).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  workspace.entries.push(entry);
  if (kind === "markdown")
    workspace.documents[entry.id] = {
      entryId: entry.id,
      content: "# Untitled\n",
      revision: 1,
      updatedAt: timestamp,
    };
  if (kind === "diagram")
    workspace.diagrams[entry.id] = emptyDiagram(entry.id, timestamp);
  touch(workspace);
  return entry;
}

export function renameEntry(
  workspace: Workspace,
  entryId: string,
  name: string,
): WorkspaceEntry {
  const entry = findEntry(workspace, entryId);
  assertNoCollision(workspace, entry.parentId, name, entry.id);
  const parent = assertParent(workspace, entry.parentId);
  entry.name = name.trim();
  entry.path = childPath(parent, entry.name);
  entry.updatedAt = now();
  recomputeDescendantPaths(workspace, entry);
  touch(workspace);
  return entry;
}

export function moveEntry(
  workspace: Workspace,
  entryId: string,
  parentId: string | null,
): WorkspaceEntry {
  const entry = findEntry(workspace, entryId);
  if (!canMoveEntry(workspace, entryId, parentId))
    throw new Error("フォルダを自分自身の中へ移動することはできません。");
  const parent = assertParent(workspace, parentId);
  assertNoCollision(workspace, parentId, entry.name, entry.id);
  entry.parentId = parentId;
  entry.path = childPath(parent, entry.name);
  entry.sortOrder = workspace.entries.filter(
    (candidate) => candidate.parentId === parentId && !candidate.deletedAt,
  ).length;
  entry.updatedAt = now();
  recomputeDescendantPaths(workspace, entry);
  touch(workspace);
  return entry;
}

export function softDeleteEntry(
  workspace: Workspace,
  entryId: string,
): WorkspaceEntry[] {
  const entry = findEntry(workspace, entryId);
  const deletedAt = now();
  const deleted = [
    entry,
    ...workspace.entries.filter(
      (candidate) =>
        candidate.path.startsWith(`${entry.path}/`) && !candidate.deletedAt,
    ),
  ];
  for (const item of deleted) {
    item.deletedAt = deletedAt;
    item.updatedAt = deletedAt;
  }
  if (
    workspace.lastOpenedEntryId === entryId ||
    deleted.some((item) => item.id === workspace.lastOpenedEntryId)
  )
    workspace.lastOpenedEntryId = null;
  touch(workspace);
  return deleted;
}

export function restoreEntries(workspace: Workspace, entryIds: string[]): void {
  for (const id of entryIds) {
    const entry = workspace.entries.find((candidate) => candidate.id === id);
    if (entry) entry.deletedAt = null;
  }
  touch(workspace);
}

export function updateDocument(
  workspace: Workspace,
  entryId: string,
  content: string,
): number {
  const entry = findEntry(workspace, entryId);
  if (entry.kind !== "markdown")
    throw new Error("Markdown 文書ではありません。");
  const previous = workspace.documents[entryId];
  const timestamp = now();
  workspace.documents[entryId] = {
    entryId,
    content,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: timestamp,
  };
  entry.updatedAt = timestamp;
  workspace.lastOpenedEntryId = entryId;
  touch(workspace);
  return workspace.documents[entryId].revision;
}

export function emptyDiagram(
  entryId: string,
  timestamp = now(),
): DiagramDocument {
  return {
    entryId,
    formatVersion: 1,
    graph: {
      formatVersion: 1,
      nodes: [
        { id: "start", position: { x: 70, y: 80 }, data: { label: "Start" } },
        { id: "end", position: { x: 310, y: 80 }, data: { label: "End" } },
      ],
      edges: [{ id: "start-end", source: "start", target: "end" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    previewAssetId: null,
    mermaidSource: null,
    updatedAt: timestamp,
  };
}

export function updateDiagram(
  workspace: Workspace,
  entryId: string,
  diagram: DiagramDocument,
): void {
  const entry = findEntry(workspace, entryId);
  if (entry.kind !== "diagram") throw new Error("図表ではありません。");
  workspace.diagrams[entryId] = { ...diagram, updatedAt: now() };
  entry.updatedAt = workspace.diagrams[entryId].updatedAt;
  touch(workspace);
}
