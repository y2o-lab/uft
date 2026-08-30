/// <reference lib="webworker" />

import {
  cloneWorkspace,
  defaultWorkspace,
  type Workspace,
} from "../domain/workspace";
import type { MigrationSnapshot } from "./workspace-repository";

// This version belongs to the storage container, not to Workspace.schemaVersion.
const STORAGE_SCHEMA_VERSION = 2;

type Request = {
  id: string;
  method:
    | "open"
    | "list"
    | "save"
    | "putAsset"
    | "getAsset"
    | "deleteAsset"
    | "createMigrationSnapshot"
    | "restoreMigrationSnapshot";
  payload?: unknown;
};
type Response =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { message: string; code?: string } };

type SqliteDb = {
  exec: (
    sql: string,
    options?: { bind?: unknown[]; returnValue?: string; rowMode?: string },
  ) => unknown;
};

let dbPromise: Promise<SqliteDb> | undefined;

async function db(): Promise<SqliteDb> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { default: sqlite3InitModule } = await import(
        "@sqlite.org/sqlite-wasm"
      );
      const sqlite3 = await sqlite3InitModule();
      const database =
        "opfs" in sqlite3
          ? new sqlite3.oo1.OpfsDb("/uft.sqlite3")
          : new sqlite3.oo1.DB(":memory:", "c");
      migrate(database as SqliteDb);
      return database as SqliteDb;
    })();
  }
  return dbPromise;
}

function migrate(database: SqliteDb): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, schema_version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_opened_entry_id TEXT);
    CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, UNIQUE(workspace_id, path));
    CREATE TABLE IF NOT EXISTS documents (entry_id TEXT PRIMARY KEY, content TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, path TEXT NOT NULL, media_type TEXT NOT NULL, byte_size INTEGER NOT NULL, checksum TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id, path));
    CREATE TABLE IF NOT EXISTS diagram_documents (entry_id TEXT PRIMARY KEY, format_version INTEGER NOT NULL, graph_json TEXT NOT NULL, preview_asset_id TEXT, mermaid_source TEXT, updated_at TEXT NOT NULL);
  `);
  const version = Number(
    rows(
      database,
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    )[0]?.version ?? 0,
  );
  if (version > STORAGE_SCHEMA_VERSION)
    throw new Error("この保存領域は新しいバージョンの UFT 用です。");
  if (version < 1)
    database.exec("INSERT INTO schema_migrations(version) VALUES (1)");
  if (version < STORAGE_SCHEMA_VERSION)
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS migration_snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        workspace_json TEXT NOT NULL
      );
      INSERT INTO schema_migrations(version) VALUES (2);
      COMMIT;
    `);
}

function rows(
  database: SqliteDb,
  sql: string,
  bind: unknown[] = [],
): Record<string, unknown>[] {
  return database.exec(sql, {
    bind,
    returnValue: "resultRows",
    rowMode: "object",
  }) as Record<string, unknown>[];
}

function loadWorkspace(
  database: SqliteDb,
  requestedId?: string,
): Workspace | null {
  const workspace = requestedId
    ? rows(database, "SELECT * FROM workspaces WHERE id = ?", [requestedId])[0]
    : rows(
        database,
        "SELECT * FROM workspaces ORDER BY updated_at DESC LIMIT 1",
      )[0];
  if (!workspace) return null;
  const workspaceId = String(workspace.id);
  const entries = rows(
    database,
    "SELECT * FROM entries WHERE workspace_id = ? ORDER BY sort_order",
    [workspaceId],
  ).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    kind: row.kind as "folder" | "markdown" | "diagram",
    name: String(row.name),
    path: String(row.path),
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  }));
  const documents = Object.fromEntries(
    rows(
      database,
      "SELECT documents.* FROM documents INNER JOIN entries ON entries.id = documents.entry_id WHERE entries.workspace_id = ?",
      [workspaceId],
    ).map((row) => [
      String(row.entry_id),
      {
        entryId: String(row.entry_id),
        content: String(row.content),
        revision: Number(row.revision),
        updatedAt: String(row.updated_at),
      },
    ]),
  );
  const assets = rows(database, "SELECT * FROM assets WHERE workspace_id = ?", [
    workspaceId,
  ]).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    path: String(row.path),
    mediaType: String(row.media_type),
    byteSize: Number(row.byte_size),
    checksum: String(row.checksum),
    createdAt: String(row.created_at),
  }));
  const diagrams = Object.fromEntries(
    rows(
      database,
      "SELECT diagram_documents.* FROM diagram_documents INNER JOIN entries ON entries.id = diagram_documents.entry_id WHERE entries.workspace_id = ?",
      [workspaceId],
    ).map((row) => [
      String(row.entry_id),
      {
        entryId: String(row.entry_id),
        formatVersion: Number(row.format_version),
        graph: JSON.parse(String(row.graph_json)),
        previewAssetId: row.preview_asset_id
          ? String(row.preview_asset_id)
          : null,
        mermaidSource: row.mermaid_source ? String(row.mermaid_source) : null,
        updatedAt: String(row.updated_at),
      },
    ]),
  );
  return {
    id: workspaceId,
    name: String(workspace.name),
    schemaVersion: Number(workspace.schema_version),
    createdAt: String(workspace.created_at),
    updatedAt: String(workspace.updated_at),
    lastOpenedEntryId: workspace.last_opened_entry_id
      ? String(workspace.last_opened_entry_id)
      : null,
    entries,
    documents,
    assets,
    diagrams,
  };
}

function saveWorkspace(database: SqliteDb, workspace: Workspace): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(
      "DELETE FROM diagram_documents WHERE entry_id IN (SELECT id FROM entries WHERE workspace_id = ?)",
      { bind: [workspace.id] },
    );
    database.exec(
      "DELETE FROM documents WHERE entry_id IN (SELECT id FROM entries WHERE workspace_id = ?)",
      { bind: [workspace.id] },
    );
    database.exec("DELETE FROM entries WHERE workspace_id = ?", {
      bind: [workspace.id],
    });
    database.exec("DELETE FROM assets WHERE workspace_id = ?", {
      bind: [workspace.id],
    });
    database.exec("DELETE FROM workspaces WHERE id = ?", {
      bind: [workspace.id],
    });
    database.exec("INSERT INTO workspaces VALUES (?, ?, ?, ?, ?, ?)", {
      bind: [
        workspace.id,
        workspace.name,
        workspace.schemaVersion,
        workspace.createdAt,
        workspace.updatedAt,
        workspace.lastOpenedEntryId,
      ],
    });
    for (const entry of workspace.entries)
      database.exec(
        "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        {
          bind: [
            entry.id,
            entry.workspaceId,
            entry.parentId,
            entry.kind,
            entry.name,
            entry.path,
            entry.sortOrder,
            entry.createdAt,
            entry.updatedAt,
            entry.deletedAt,
          ],
        },
      );
    for (const document of Object.values(workspace.documents))
      database.exec("INSERT INTO documents VALUES (?, ?, ?, ?)", {
        bind: [
          document.entryId,
          document.content,
          document.revision,
          document.updatedAt,
        ],
      });
    for (const asset of workspace.assets)
      database.exec("INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)", {
        bind: [
          asset.id,
          asset.workspaceId,
          asset.path,
          asset.mediaType,
          asset.byteSize,
          asset.checksum,
          asset.createdAt,
        ],
      });
    for (const diagram of Object.values(workspace.diagrams))
      database.exec("INSERT INTO diagram_documents VALUES (?, ?, ?, ?, ?, ?)", {
        bind: [
          diagram.entryId,
          diagram.formatVersion,
          JSON.stringify(diagram.graph),
          diagram.previewAssetId,
          diagram.mermaidSource,
          diagram.updatedAt,
        ],
      });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function assetDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle("uft-assets", { create: true });
}

async function putAsset(payload: {
  id: string;
  bytes: ArrayBuffer;
}): Promise<void> {
  const handle = await (await assetDirectory()).getFileHandle(payload.id, {
    create: true,
  });
  const writable = await handle.createWritable();
  await writable.write(payload.bytes);
  await writable.close();
}

async function getAsset(id: string): Promise<ArrayBuffer | null> {
  try {
    return await (await (await assetDirectory()).getFileHandle(id))
      .getFile()
      .then((file) => file.arrayBuffer());
  } catch {
    return null;
  }
}

async function removeAsset(id: string): Promise<void> {
  await (await assetDirectory()).removeEntry(id).catch(() => undefined);
}

async function snapshotDirectory(
  id: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const backups = await root.getDirectoryHandle("uft-migration-backups", {
    create,
  });
  return backups.getDirectoryHandle(id, { create });
}

async function putFile(
  directory: FileSystemDirectoryHandle,
  id: string,
  bytes: ArrayBuffer,
): Promise<void> {
  const handle = await directory.getFileHandle(id, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

async function removeSnapshotDirectory(id: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const backups = await root.getDirectoryHandle("uft-migration-backups");
    await backups.removeEntry(id, { recursive: true });
  } catch {
    // A partially created backup is never registered in SQLite.
  }
}

async function createMigrationSnapshot(
  database: SqliteDb,
  payload: { workspace: Workspace; reason: string },
): Promise<MigrationSnapshot> {
  const snapshot: MigrationSnapshot = {
    id: `migration-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
    workspaceId: payload.workspace.id,
    schemaVersion: payload.workspace.schemaVersion,
    createdAt: new Date().toISOString(),
    reason: payload.reason,
  };
  try {
    const directory = await snapshotDirectory(snapshot.id, true);
    for (const asset of payload.workspace.assets) {
      const bytes = await getAsset(asset.id);
      if (!bytes)
        throw new Error(`移行前バックアップを作成できません: ${asset.path}`);
      await putFile(directory, asset.id, bytes);
    }
    database.exec("INSERT INTO migration_snapshots VALUES (?, ?, ?, ?, ?, ?)", {
      bind: [
        snapshot.id,
        snapshot.workspaceId,
        snapshot.schemaVersion,
        snapshot.createdAt,
        snapshot.reason,
        JSON.stringify(cloneWorkspace(payload.workspace)),
      ],
    });
    return snapshot;
  } catch (error) {
    await removeSnapshotDirectory(snapshot.id);
    throw error;
  }
}

async function restoreMigrationSnapshot(
  database: SqliteDb,
  id: string,
): Promise<Workspace> {
  const row = rows(
    database,
    "SELECT workspace_json FROM migration_snapshots WHERE id = ?",
    [id],
  )[0];
  if (!row) throw new Error("移行前バックアップが見つかりません。");
  let workspace: Workspace;
  try {
    workspace = JSON.parse(String(row.workspace_json)) as Workspace;
  } catch {
    throw new Error("移行前バックアップが壊れています。");
  }
  const current = loadWorkspace(database, workspace.id);
  const directory = await snapshotDirectory(id, false);
  for (const asset of workspace.assets) {
    const bytes = await (await directory.getFileHandle(asset.id))
      .getFile()
      .then((file) => file.arrayBuffer());
    await putAsset({ id: asset.id, bytes });
  }
  saveWorkspace(database, workspace);
  for (const asset of current?.assets ?? []) {
    if (
      !workspace.assets.some((snapshotAsset) => snapshotAsset.id === asset.id)
    )
      await removeAsset(asset.id);
  }
  return cloneWorkspace(workspace);
}

async function dispatch(request: Request): Promise<unknown> {
  if (request.method === "putAsset")
    return putAsset(request.payload as { id: string; bytes: ArrayBuffer });
  if (request.method === "getAsset") return getAsset(String(request.payload));
  if (request.method === "deleteAsset")
    return removeAsset(String(request.payload));
  const database = await db();
  if (request.method === "createMigrationSnapshot")
    return createMigrationSnapshot(
      database,
      request.payload as { workspace: Workspace; reason: string },
    );
  if (request.method === "restoreMigrationSnapshot")
    return restoreMigrationSnapshot(database, String(request.payload));
  if (request.method === "open")
    return (
      loadWorkspace(
        database,
        request.payload ? String(request.payload) : undefined,
      ) ?? cloneWorkspace(defaultWorkspace)
    );
  if (request.method === "list")
    return rows(
      database,
      "SELECT id, name, updated_at FROM workspaces ORDER BY updated_at DESC",
    ).map((workspace) => ({
      id: String(workspace.id),
      name: String(workspace.name),
      updatedAt: String(workspace.updated_at),
    }));
  if (request.method === "save")
    return saveWorkspace(database, request.payload as Workspace);
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
  dispatch(event.data).then(
    (result) =>
      self.postMessage({
        id: event.data.id,
        ok: true,
        result,
      } satisfies Response),
    (error: unknown) =>
      self.postMessage({
        id: event.data.id,
        ok: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "保存領域を初期化できませんでした。",
          code: "STORAGE_ERROR",
        },
      } satisfies Response),
  );
});
