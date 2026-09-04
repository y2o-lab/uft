import {
  cloneWorkspace,
  type DiagramDocument,
  type Document,
  type Workspace,
  type WorkspaceEntry,
} from "../domain/workspace";

function newer<T extends { updatedAt: string }>(
  left: T | undefined,
  right: T | undefined,
): T | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.updatedAt >= right.updatedAt ? left : right;
}

function mergeById<T extends { updatedAt: string }>(
  left: Record<string, T>,
  right: Record<string, T>,
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const id of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const value = newer(left[id], right[id]);
    if (value) result[id] = value;
  }
  return result;
}

function asRecord<T extends { id: string; updatedAt: string }>(
  values: T[],
): Record<string, T> {
  return Object.fromEntries(values.map((value) => [value.id, value]));
}

/**
 * Combines independent tab snapshots without dropping unrelated edits. When two
 * tabs edit the exact same object, its per-object timestamp gives a predictable
 * last-write-wins result. Save operations are serialised by a short Web Lock,
 * so this function always receives the most recently persisted base snapshot.
 */
export function mergeWorkspaces(
  persisted: Workspace,
  local: Workspace,
): Workspace {
  if (persisted.id !== local.id) return cloneWorkspace(local);
  const entries = Object.values(
    mergeById<WorkspaceEntry>(
      asRecord(persisted.entries),
      asRecord(local.entries),
    ),
  ).sort((left, right) => left.sortOrder - right.sortOrder);
  const documents = mergeById<Document>(persisted.documents, local.documents);
  const diagrams = mergeById<DiagramDocument>(
    persisted.diagrams,
    local.diagrams,
  );
  const assets = new Map(persisted.assets.map((asset) => [asset.id, asset]));
  for (const asset of local.assets) assets.set(asset.id, asset);

  return cloneWorkspace({
    ...persisted,
    ...local,
    schemaVersion: Math.max(persisted.schemaVersion, local.schemaVersion),
    createdAt:
      persisted.createdAt <= local.createdAt
        ? persisted.createdAt
        : local.createdAt,
    updatedAt:
      persisted.updatedAt >= local.updatedAt
        ? persisted.updatedAt
        : local.updatedAt,
    entries,
    documents,
    diagrams,
    assets: [...assets.values()],
    // Navigation is local UI state. Keeping the local selection avoids a
    // remote save unexpectedly moving the document another tab is viewing.
    lastOpenedEntryId: local.lastOpenedEntryId ?? persisted.lastOpenedEntryId,
  });
}
