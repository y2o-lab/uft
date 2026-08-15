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
      this.#worker.postMessage({ id, method, payload }, transfer ?? []);
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
}

class IndexedDbRepository implements WorkspaceRepository {
  readonly mode = "indexeddb" as const;
  #database?: Promise<IDBDatabase>;
  #queue: Promise<void> = Promise.resolve();
  #openDb(): Promise<IDBDatabase> {
    if (!this.#database)
      this.#database = new Promise((resolve, reject) => {
        const request = indexedDB.open("uft-fallback", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("workspace");
          request.result.createObjectStore("assets");
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
  open(): Promise<Workspace> {
    return this.#value<Workspace>("workspace", "active").then(
      (workspace) => workspace ?? cloneWorkspace(defaultWorkspace),
    );
  }
  async listWorkspaces(): Promise<
    Array<{ id: string; name: string; updatedAt: string }>
  > {
    const workspace = await this.open();
    return [
      {
        id: workspace.id,
        name: workspace.name,
        updatedAt: workspace.updatedAt,
      },
    ];
  }
  save(workspace: Workspace): Promise<void> {
    return this.#enqueue(() =>
      this.#put("workspace", "active", cloneWorkspace(workspace)),
    );
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
  return typeof Worker !== "undefined" && "storage" in navigator
    ? new WorkerRepository()
    : new IndexedDbRepository();
}

export function createFallbackWorkspaceRepository(): WorkspaceRepository {
  return new IndexedDbRepository();
}
