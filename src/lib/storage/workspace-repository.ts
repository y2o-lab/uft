import {
  type Asset,
  cloneWorkspace,
  defaultWorkspace,
  type Workspace,
} from "../domain/workspace";

type Method =
  | "open"
  | "list"
  | "save"
  | "putAsset"
  | "getAsset"
  | "deleteAsset";
type WorkerResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { message: string };
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
  readonly mode: "opfs-sqlite" | "indexeddb";
}

class WorkerRepository implements WorkspaceRepository {
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
      (event: MessageEvent<WorkerResponse>) => {
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
        new Error(event.message || "SQLite 保存 Worker の起動に失敗しました。"),
      );
    });
    this.#worker.addEventListener("messageerror", () => {
      this.#rejectPending(new Error("SQLite 保存 Worker と通信できません。"));
    });
  }

  #call<T>(
    method: Method,
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
            : new Error("SQLite 保存 Worker と通信できません。"),
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
  #enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
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
  #enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }
}

export function createWorkspaceRepository(): WorkspaceRepository {
  return typeof Worker !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
    ? new WorkerRepository()
    : new IndexedDbRepository();
}

export function createFallbackWorkspaceRepository(): WorkspaceRepository {
  return new IndexedDbRepository();
}
