import {
  type Asset,
  cloneWorkspace,
  defaultWorkspace,
  type Workspace,
} from "../domain/workspace";

export type MigrationSnapshot = {
  id: string;
  workspaceId: string;
  schemaVersion: number;
  createdAt: string;
  reason: string;
};

export interface WorkspaceRepository {
  open(id?: string): Promise<Workspace>;
  listWorkspaces(): Promise<
    Array<{ id: string; name: string; updatedAt: string }>
  >;
  save(workspace: Workspace): Promise<void>;
  putAsset(asset: Asset, bytes: ArrayBuffer): Promise<void>;
  getAsset(id: string): Promise<ArrayBuffer | null>;
  deleteAsset(id: string): Promise<void>;
  createMigrationSnapshot(
    workspace: Workspace,
    reason: string,
  ): Promise<MigrationSnapshot>;
  restoreMigrationSnapshot(id: string): Promise<Workspace>;
  readonly mode: "opfs-sqlite" | "indexeddb";
}

type LegacyMethod =
  | "open"
  | "list"
  | "save"
  | "putAsset"
  | "getAsset"
  | "deleteAsset"
  | "createMigrationSnapshot"
  | "restoreMigrationSnapshot";
type LegacyResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string };
};

// Kept solely to import workspaces created by the previous OPFS SQLite build.
// New writes use IndexedDB, whose transactions can be shared across tabs.
class LegacyOpfsRepository implements WorkspaceRepository {
  readonly mode = "opfs-sqlite" as const;
  #worker = new Worker(new URL("./workspace.worker.ts", import.meta.url), {
    type: "module",
  });
  #pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: number;
    }
  >();
  #queue: Promise<void> = Promise.resolve();

  constructor() {
    this.#worker.addEventListener(
      "message",
      (event: MessageEvent<LegacyResponse>) => {
        const pending = this.#pending.get(event.data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#pending.delete(event.data.id);
        if (event.data.ok) pending.resolve(event.data.result);
        else
          pending.reject(
            new Error(
              event.data.error?.message ?? "ストレージ操作に失敗しました。",
            ),
          );
      },
    );
    this.#worker.addEventListener("error", (event) => {
      this.#rejectPending(
        new Error(event.message || "旧形式の保存領域を開けません。"),
      );
    });
  }

  #call<T>(
    method: LegacyMethod,
    payload?: unknown,
    transfer?: Transferable[],
  ): Promise<T> {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("ストレージ操作がタイムアウトしました。"));
      }, 20_000);
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.#worker.postMessage({ id, method, payload }, transfer ?? []);
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(
          error instanceof Error
            ? error
            : new Error("旧形式の保存領域と通信できません。"),
        );
      }
    });
  }

  open(id?: string): Promise<Workspace> {
    return this.#call<Workspace>("open", id);
  }
  listWorkspaces(): Promise<
    Array<{ id: string; name: string; updatedAt: string }>
  > {
    return this.#call("list");
  }
  save(workspace: Workspace): Promise<void> {
    return this.#enqueue(() => this.#call("save", cloneWorkspace(workspace)));
  }
  putAsset(asset: Asset, bytes: ArrayBuffer): Promise<void> {
    return this.#enqueue(() =>
      this.#call("putAsset", { id: asset.id, bytes }, [bytes]),
    );
  }
  getAsset(id: string): Promise<ArrayBuffer | null> {
    return this.#call<ArrayBuffer | null>("getAsset", id);
  }
  deleteAsset(id: string): Promise<void> {
    return this.#enqueue(() => this.#call("deleteAsset", id));
  }
  createMigrationSnapshot(
    workspace: Workspace,
    reason: string,
  ): Promise<MigrationSnapshot> {
    return this.#enqueue(() =>
      this.#call("createMigrationSnapshot", {
        workspace: cloneWorkspace(workspace),
        reason,
      }),
    );
  }
  restoreMigrationSnapshot(id: string): Promise<Workspace> {
    return this.#enqueue(() => this.#call("restoreMigrationSnapshot", id));
  }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }
}

class IndexedDbRepository implements WorkspaceRepository {
  readonly mode = "indexeddb" as const;
  #database?: Promise<IDBDatabase>;
  #queue: Promise<void> = Promise.resolve();
  #openDb(): Promise<IDBDatabase> {
    if (!this.#database)
      this.#database = new Promise((resolve, reject) => {
        const request = indexedDB.open("uft-fallback", 2);
        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const database = request.result;
          const transaction = request.transaction;
          if (!transaction)
            throw new Error("IndexedDB の初期化に失敗しました。");
          const workspaces = database.objectStoreNames.contains("workspace")
            ? transaction.objectStore("workspace")
            : database.createObjectStore("workspace");
          if (!database.objectStoreNames.contains("assets"))
            database.createObjectStore("assets");
          const metadata = database.objectStoreNames.contains("metadata")
            ? transaction.objectStore("metadata")
            : database.createObjectStore("metadata");
          if (event.oldVersion < 2) {
            const legacyWorkspace = workspaces.get("active");
            legacyWorkspace.onsuccess = () => {
              const workspace = legacyWorkspace.result as Workspace | undefined;
              if (!workspace) return;
              workspaces.put(cloneWorkspace(workspace), workspace.id);
              metadata.put(workspace.id, "activeWorkspaceId");
              workspaces.delete("active");
            };
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    return this.#database;
  }
  async #value<T>(store: string, key: string): Promise<T | undefined> {
    const db = await this.#openDb();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(store, "readonly")
        .objectStore(store)
        .get(key);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }
  async #put(store: string, key: string, value: unknown): Promise<void> {
    const db = await this.#openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(store, "readwrite")
        .objectStore(store)
        .put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  async #values<T>(store: string): Promise<T[]> {
    const db = await this.#openDb();
    return new Promise((resolve, reject) => {
      const request = db
        .transaction(store, "readonly")
        .objectStore(store)
        .getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }
  async #saveWorkspace(workspace: Workspace): Promise<void> {
    const db = await this.#openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["workspace", "metadata"],
        "readwrite",
      );
      transaction
        .objectStore("workspace")
        .put(cloneWorkspace(workspace), workspace.id);
      transaction
        .objectStore("metadata")
        .put(workspace.id, "activeWorkspaceId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  async open(id?: string): Promise<Workspace> {
    const activeId =
      id ?? (await this.#value<string>("metadata", "activeWorkspaceId"));
    let workspace = activeId
      ? await this.#value<Workspace>("workspace", activeId)
      : undefined;
    if (id && !workspace)
      throw new Error("指定されたワークスペースが見つかりません。");
    if (!workspace) {
      const workspaces = await this.#values<Workspace>("workspace");
      workspace = workspaces
        .filter((candidate) => candidate?.id && candidate.id !== "active")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    }
    if (!workspace) return cloneWorkspace(defaultWorkspace);
    if (id && workspace.id === id)
      await this.#put("metadata", "activeWorkspaceId", workspace.id);
    return cloneWorkspace(workspace);
  }
  async listWorkspaces(): Promise<
    Array<{ id: string; name: string; updatedAt: string }>
  > {
    return (await this.#values<Workspace>("workspace"))
      .filter((workspace) => workspace?.id && workspace.id !== "active")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        updatedAt: workspace.updatedAt,
      }));
  }
  save(workspace: Workspace): Promise<void> {
    return this.#enqueue(() => this.#saveWorkspace(workspace));
  }
  putAsset(asset: Asset, bytes: ArrayBuffer): Promise<void> {
    return this.#enqueue(() => this.#put("assets", asset.id, bytes));
  }
  getAsset(id: string): Promise<ArrayBuffer | null> {
    return this.#value<ArrayBuffer>("assets", id).then(
      (value) => value ?? null,
    );
  }
  deleteAsset(id: string): Promise<void> {
    return this.#enqueue(async () => {
      const db = await this.#openDb();
      await new Promise<void>((resolve, reject) => {
        const request = db
          .transaction("assets", "readwrite")
          .objectStore("assets")
          .delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }
  async createMigrationSnapshot(
    workspace: Workspace,
    reason: string,
  ): Promise<MigrationSnapshot> {
    const assets = await Promise.all(
      workspace.assets.map(async (asset) => {
        const bytes = await this.getAsset(asset.id);
        if (!bytes)
          throw new Error(`移行前バックアップを作成できません: ${asset.path}`);
        return { id: asset.id, bytes };
      }),
    );
    const snapshot: MigrationSnapshot & {
      workspace: Workspace;
      assets: Array<{ id: string; bytes: ArrayBuffer }>;
    } = {
      id: `migration-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      workspaceId: workspace.id,
      schemaVersion: workspace.schemaVersion,
      createdAt: new Date().toISOString(),
      reason,
      workspace: cloneWorkspace(workspace),
      assets,
    };
    // Keep snapshots in the pre-existing metadata store. Increasing the IDB
    // version would prevent an older emergency-rollback build from opening it.
    await this.#put("metadata", `migrationSnapshot:${snapshot.id}`, snapshot);
    return snapshot;
  }
  async restoreMigrationSnapshot(id: string): Promise<Workspace> {
    const snapshot = await this.#value<
      MigrationSnapshot & {
        workspace: Workspace;
        assets: Array<{ id: string; bytes: ArrayBuffer }>;
      }
    >("metadata", `migrationSnapshot:${id}`);
    if (!snapshot) throw new Error("移行前バックアップが見つかりません。");
    const current = await this.open(snapshot.workspace.id);
    const db = await this.#openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ["workspace", "assets", "metadata"],
        "readwrite",
      );
      const assets = transaction.objectStore("assets");
      for (const asset of current.assets) assets.delete(asset.id);
      for (const asset of snapshot.assets) assets.put(asset.bytes, asset.id);
      transaction
        .objectStore("workspace")
        .put(cloneWorkspace(snapshot.workspace), snapshot.workspace.id);
      transaction
        .objectStore("metadata")
        .put(snapshot.workspace.id, "activeWorkspaceId");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return cloneWorkspace(snapshot.workspace);
  }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export function createWorkspaceRepository(): WorkspaceRepository {
  // OPFS SQLite requires an exclusive synchronous access handle, making a
  // second browser tab fail or block. IndexedDB supports concurrent tabs and
  // is therefore the canonical store for the workspace's live-sync mode.
  return new IndexedDbRepository();
}

export function createFallbackWorkspaceRepository(): WorkspaceRepository {
  return new IndexedDbRepository();
}

export function createLegacyOpfsRepository(): WorkspaceRepository | null {
  return typeof Worker !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
    ? new LegacyOpfsRepository()
    : null;
}
