import { activeEntries } from "../domain/tree";
import type { Workspace } from "../domain/workspace";
import { migrateWorkspace } from "../domain/workspace-migrations";
import {
  createFallbackWorkspaceRepository,
  createLegacyOpfsRepository,
  createWorkspaceRepository,
  type WorkspaceRepository,
} from "../storage/workspace-repository";
import { mergeWorkspaces } from "./workspace-sync";

type StatusTone = "info" | "error";

export type WorkspaceSessionContext = {
  getWorkspace: () => Workspace | null;
  setWorkspace: (workspace: Workspace) => void;
  getRepository: () => WorkspaceRepository | null;
  setRepository: (repository: WorkspaceRepository) => void;
  getAssetUrls: () => Record<string, string>;
  setAssetUrls: (urls: Record<string, string>) => void;
  setActiveEntryId: (entryId: string | null) => void;
  setExpanded: (entryIds: Set<string>) => void;
  setStatus: (status: string) => void;
  setStatusTone: (tone: StatusTone) => void;
  notify: (error: unknown) => void;
  saveNow: () => Promise<boolean>;
};

export type WorkspaceSession = {
  initialize: () => Promise<void>;
  refreshFromStorage: (workspaceId?: string) => Promise<void>;
  hydrateAssets: () => Promise<void>;
  openWorkspace: (workspaceId: string) => Promise<void>;
  announceSave: (workspaceId: string) => void;
  dispose: () => void;
};

export function createWorkspaceSession(
  context: WorkspaceSessionContext,
): WorkspaceSession {
  let syncChannel: BroadcastChannel | undefined;
  let synchronizing = false;
  const tabId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  async function importLegacyOpfsWorkspaces(
    target: WorkspaceRepository,
  ): Promise<void> {
    const migrate = async (): Promise<void> => {
      if ((await target.listWorkspaces()).length) return;
      const legacy = createLegacyOpfsRepository();
      if (!legacy) return;
      const workspaces = await legacy.listWorkspaces();
      for (const item of workspaces) {
        const imported = await legacy.open(item.id);
        for (const asset of imported.assets) {
          const bytes = await legacy.getAsset(asset.id);
          if (bytes) await target.putAsset(asset, bytes);
        }
        await target.save(imported);
      }
    };
    try {
      if ("locks" in navigator)
        await navigator.locks.request("uft-workspace-legacy-import", migrate);
      else await migrate();
    } catch {
      // A failed legacy import must not prevent a new multi-tab workspace from
      // opening. The prior OPFS data remains untouched and can be retried later.
    }
  }

  async function migrateLoadedWorkspace(
    candidate: Workspace,
  ): Promise<Workspace> {
    const repository = context.getRepository();
    if (!repository) throw new Error("保存領域を初期化できませんでした。");
    const migration = migrateWorkspace(candidate);
    if (!migration.migrated) return candidate;
    await repository.createMigrationSnapshot(
      candidate,
      `workspace schema ${migration.fromVersion} to ${migration.toVersion}`,
    );
    await repository.save(migration.workspace);
    return migration.workspace;
  }

  function announceWorkspaceSave(workspaceId: string): void {
    syncChannel?.postMessage({ source: tabId, workspaceId });
  }

  function startWorkspaceSync(): void {
    if (typeof BroadcastChannel === "undefined") return;
    syncChannel = new BroadcastChannel("uft-workspace-sync");
    syncChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        !message ||
        typeof message !== "object" ||
        !("source" in message) ||
        !("workspaceId" in message) ||
        message.source === tabId ||
        typeof message.workspaceId !== "string"
      )
        return;
      void refreshFromStorage(message.workspaceId);
    });
  }

  async function hydrateAssets(): Promise<void> {
    const workspace = context.getWorkspace();
    const repository = context.getRepository();
    if (!workspace || !repository) return;
    const urls: Record<string, string> = {};
    for (const asset of workspace.assets) {
      const bytes = await repository.getAsset(asset.id);
      if (bytes)
        urls[asset.path] = URL.createObjectURL(
          new Blob([bytes], { type: asset.mediaType }),
        );
    }
    Object.values(context.getAssetUrls()).forEach(URL.revokeObjectURL);
    context.setAssetUrls(urls);
  }

  async function refreshFromStorage(
    workspaceId = context.getWorkspace()?.id,
  ): Promise<void> {
    const workspace = context.getWorkspace();
    const repository = context.getRepository();
    if (
      !workspaceId ||
      !workspace ||
      !repository ||
      workspace.id !== workspaceId ||
      synchronizing
    )
      return;
    synchronizing = true;
    try {
      const stored = await repository.open(workspaceId);
      const next = mergeWorkspaces(stored, workspace);
      if (JSON.stringify(next) !== JSON.stringify(workspace)) {
        context.setWorkspace(next);
        await hydrateAssets();
        context.setStatus("別のタブの変更を同期しました");
        context.setStatusTone("info");
      }
    } catch (error) {
      context.notify(error);
    } finally {
      synchronizing = false;
    }
  }

  async function initialize(): Promise<void> {
    try {
      let repository = createWorkspaceRepository();
      context.setRepository(repository);
      let workspace: Workspace;
      try {
        await importLegacyOpfsWorkspaces(repository);
        workspace = await repository.open();
      } catch {
        repository = createFallbackWorkspaceRepository();
        context.setRepository(repository);
        workspace = await repository.open();
        context.setStatus("SQLite を利用できないため互換保存モードで動作中");
      }
      workspace = await migrateLoadedWorkspace(workspace);
      // The initial fixture otherwise exists only in memory. Store it before
      // users can create or select another workspace so it is always reopenable.
      await repository.save(workspace);
      context.setWorkspace(workspace);
      startWorkspaceSync();
      const requestedEntryId = new URLSearchParams(window.location.search).get(
        "entry",
      );
      context.setActiveEntryId(
        (requestedEntryId &&
        activeEntries(workspace).some((entry) => entry.id === requestedEntryId)
          ? requestedEntryId
          : workspace.lastOpenedEntryId) ??
          activeEntries(workspace).find(
            (entry) => entry.path === "docs/overview.md",
          )?.id ??
          activeEntries(workspace).find((entry) => entry.kind === "markdown")
            ?.id ??
          null,
      );
      context.setExpanded(
        new Set(
          activeEntries(workspace)
            .filter((entry) => entry.kind === "folder")
            .map((entry) => entry.id),
        ),
      );
      await hydrateAssets();
      context.setStatus("複数タブ同期モードで動作中");
    } catch (error) {
      context.setStatusTone("error");
      context.setStatus(
        "保存領域を開けませんでした。ブラウザのサイトデータ設定を確認してください。",
      );
      context.notify(error);
    }
  }

  async function openWorkspace(selected: string): Promise<void> {
    const repository = context.getRepository();
    const currentWorkspace = context.getWorkspace();
    if (!repository || !selected || selected === currentWorkspace?.id) return;
    try {
      // Finish any delayed auto-save while it still belongs to the currently
      // displayed workspace. A delayed save must never run after selection.
      if (!(await context.saveNow())) return;
      const workspace = await migrateLoadedWorkspace(
        await repository.open(selected),
      );
      if (workspace.id !== selected)
        throw new Error("指定されたワークスペースが見つかりません。");
      context.setWorkspace(workspace);
      context.setActiveEntryId(
        workspace.lastOpenedEntryId ??
          activeEntries(workspace).find((entry) => entry.kind === "markdown")
            ?.id ??
          null,
      );
      context.setExpanded(
        new Set(
          activeEntries(workspace)
            .filter((entry) => entry.kind === "folder")
            .map((entry) => entry.id),
        ),
      );
      await hydrateAssets();
      context.setStatus(`「${workspace.name}」を開きました`);
      context.setStatusTone("info");
    } catch (error) {
      context.notify(error);
    }
  }

  return {
    initialize,
    refreshFromStorage,
    hydrateAssets,
    openWorkspace,
    announceSave: announceWorkspaceSave,
    dispose: () => syncChannel?.close(),
  };
}
