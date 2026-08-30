import {
  cloneWorkspace,
  WORKSPACE_SCHEMA_VERSION,
  type Workspace,
} from "./workspace";

export const MIN_READABLE_WORKSPACE_SCHEMA_VERSION = 1;

export class WorkspaceMigrationError extends Error {}

export type WorkspaceMigrationResult = {
  workspace: Workspace;
  fromVersion: number;
  toVersion: number;
  migrated: boolean;
};

function migrateV1ToV2(workspace: Workspace): Workspace {
  // Version 2 establishes the app-managed migration contract. It deliberately
  // does not remove or rename any persisted field, so version 1 clients can
  // continue to read the record during an emergency deployment rollback.
  return {
    ...workspace,
    lastOpenedEntryId: workspace.lastOpenedEntryId ?? null,
    schemaVersion: 2,
  };
}

export function migrateWorkspace(
  workspace: Workspace,
): WorkspaceMigrationResult {
  const source = cloneWorkspace(workspace);
  const fromVersion = source.schemaVersion;
  if (
    !Number.isSafeInteger(fromVersion) ||
    fromVersion < MIN_READABLE_WORKSPACE_SCHEMA_VERSION
  )
    throw new WorkspaceMigrationError(
      "対応していない古いワークスペース形式です。",
    );
  if (fromVersion > WORKSPACE_SCHEMA_VERSION)
    throw new WorkspaceMigrationError(
      "このワークスペースは新しいバージョンの UFT で作成されています。",
    );

  let migrated = source;
  while (migrated.schemaVersion < WORKSPACE_SCHEMA_VERSION) {
    switch (migrated.schemaVersion) {
      case 1:
        migrated = migrateV1ToV2(migrated);
        break;
      default:
        throw new WorkspaceMigrationError(
          "ワークスペースの移行手順がありません。",
        );
    }
  }

  return {
    workspace: migrated,
    fromVersion,
    toVersion: migrated.schemaVersion,
    migrated: fromVersion !== migrated.schemaVersion,
  };
}
