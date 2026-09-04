<script lang="ts">
import { onMount } from "svelte";
import {
  Download,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Command,
  FileInput,
  FileOutput,
  FilePlus,
  FileText,
  Files,
  FolderPlus,
  House,
  Minus,
  Pencil,
  Save,
  Trash2,
  Undo2,
  X,
  Workflow,
  type LucideIcon,
} from "@lucide/svelte";
import CodeMirrorEditor from "./lib/components/CodeMirrorEditor.svelte";
import ConfirmDialog from "./lib/components/ConfirmDialog.svelte";
import MarkdownPreview from "./lib/components/MarkdownPreview.svelte";
import MarkdownDiff from "./lib/components/MarkdownDiff.svelte";
import Toast from "./lib/components/Toast.svelte";
import ErrorPage from "./lib/components/ErrorPage.svelte";
import { activeEntries, canMoveEntry, orderedChildren } from "./lib/domain/tree";
import {
  type Asset,
  cloneWorkspace,
  type EntryKind,
  newId,
  type Workspace,
  type WorkspaceEntry,
} from "./lib/domain/workspace";
import { migrateWorkspace } from "./lib/domain/workspace-migrations";
import { relativeAssetPath } from "./lib/markdown/preview";
import { countMarkdownCharacters } from "./lib/markdown/character-count";
import {
  createFallbackWorkspaceRepository,
  createLegacyOpfsRepository,
  createWorkspaceRepository,
  type WorkspaceRepository,
} from "./lib/storage/workspace-repository";
import {
  download,
  exportWorkspace,
  importWorkspace,
} from "./lib/transfer/workspace-zip";
import {
  createEntry,
  moveEntry,
  renameEntry,
  restoreEntries,
  softDeleteEntry,
  updateDocument,
} from "./lib/workspace/workspace-service";
import { mergeWorkspaces } from "./lib/workspace/workspace-sync";
import { graphToMermaid, graphToSvg } from "./lib/diagrams/diagram";
import { AnyDocClient } from "./lib/import/anydoc-client";
import {
  documentAccept,
  type ImportProgress,
  type ImportResult,
  importDocuments,
} from "./lib/import/document-import";
import type { Component } from "svelte";

type Mode = "source" | "split" | "preview" | "diff";
type AppPage = "launcher" | "workspace" | "document-import" | "not-found";
type LauncherTool = {
  id: string;
  href: string;
  icon: LucideIcon;
  name: string;
  description: string;
};

function currentPage(): AppPage {
  if (window.location.pathname === "/convert-to-markdown")
    return "document-import";
  if (window.location.pathname === "/workspace") return "workspace";
  if (window.location.pathname === "/") return "launcher";
  return "not-found";
}
let workspace = $state<Workspace | null>(null);
let repository = $state<WorkspaceRepository | null>(null);
let activeEntryId = $state<string | null>(null);
let mode = $state<Mode>("split");
let compareEntryId = $state("");
let comparisonPickerOpen = $state(false);
let comparisonQuery = $state("");
let comparisonSearchInput = $state<HTMLInputElement>();
let comparisonPickerButton = $state<HTMLButtonElement>();
let comparisonActiveIndex = $state(0);
let status = $state("ローカルワークスペースを準備中");
let statusTone = $state<"info" | "error">("info");
let toast = $state("");
let paletteOpen = $state(false);
let query = $state("");
let deleteTarget = $state<WorkspaceEntry | null>(null);
let expanded = $state(new Set<string>());
let draggingEntryId = $state<string | null>(null);
let dropTargetId = $state<string | null>(null);
let assetUrls = $state<Record<string, string>>({});
let insertIntoEditor: (text: string) => void = () => undefined;
let pendingEditorInsertion = $state<string | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let deletedIds = $state<string[]>([]);
let importInput = $state<HTMLInputElement>();
let imageInput = $state<HTMLInputElement>();
let documentImportInput = $state<HTMLInputElement>();
let documentImportClient: AnyDocClient | undefined;
let importController: AbortController | undefined;
let documentImportResults = $state<ImportResult[]>([]);
let documentImportProgress = $state<ImportProgress>({ completed: 0, total: 0 });
let importingDocuments = $state(false);
let completedImportEntry = $state<WorkspaceEntry | null>(null);
let page = $state<AppPage>(currentPage());
let isDocumentImport = $derived(page === "document-import");
let isLauncher = $derived(page === "launcher");
let isNotFound = $derived(page === "not-found");
let launcherQuery = $state("");
let launcherSearchInput = $state<HTMLInputElement>();
let launcherOpen = $state(false);
let launcherSelectedIndex = $state(0);
let workspaceSyncChannel: BroadcastChannel | undefined;
const tabId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
let synchronizingWorkspace = false;
const diagramSaveVersions = new Map<string, number>();
let DiagramEditor = $state<Component<{ diagram: import("./lib/domain/workspace").DiagramDocument; onChange: (diagram: import("./lib/domain/workspace").DiagramDocument) => void }> | null>(null);

let activeEntry = $derived(
  workspace && activeEntryId
    ? (activeEntries(workspace).find((entry) => entry.id === activeEntryId) ??
        null)
    : null,
);
let activeDocument = $derived(
  workspace && activeEntry?.kind === "markdown"
    ? workspace.documents[activeEntry.id]
    : null,
);
let activeMarkdown = $derived(
  activeEntry?.kind === "markdown" && activeDocument
    ? { entry: activeEntry, document: activeDocument }
    : null,
);
let markdownCharacterCount = $derived(
  activeMarkdown ? countMarkdownCharacters(activeMarkdown.document.content) : 0,
);
let activeDiagram = $derived(
  workspace && activeEntry?.kind === "diagram"
    ? workspace.diagrams[activeEntry.id] ?? null
    : null,
);
let markdownEntries = $derived(
  workspace ? activeEntries(workspace).filter((entry) => entry.kind === "markdown") : [],
);
let comparisonEntries = $derived(
  markdownEntries.filter((entry) => entry.id !== activeEntry?.id),
);
let compareEntry = $derived(
  comparisonEntries.find((entry) => entry.id === compareEntryId) ?? null,
);
let compareDocument = $derived(
  workspace && compareEntry ? workspace.documents[compareEntry.id] ?? null : null,
);
let matchingComparisonEntries = $derived(
  comparisonEntries.filter((entry) =>
    entry.path.toLocaleLowerCase().includes(comparisonQuery.trim().toLocaleLowerCase()),
  ),
);
let visibleEntries = $derived(workspace ? flattenEntries(workspace) : []);
let documentTitle = $derived(activeEntry?.path ?? "ワークスペース");
const launcherTools: LauncherTool[] = [
  {
    id: "markdown-workspace",
    href: "/workspace",
    icon: FileText,
    name: "Markdown ワークスペース",
    description: "文書の作成、編集、プレビュー、ZIP バックアップ",
  },
  {
    id: "document-import",
    href: "/convert-to-markdown",
    icon: FileInput,
    name: "文書を Markdown に変換",
    description: "ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加",
  },
];
let matchingLauncherTools = $derived(
  launcherTools.filter((tool) => {
    const query = launcherQuery.trim().toLocaleLowerCase();
    return !query || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(query);
  }),
);
const commands: Array<{ name: string; action: () => void }> = [
  { name: "新しい Markdown 文書", action: () => create("markdown") },
  { name: "新しいフォルダ", action: () => create("folder") },
  { name: "新しい図表", action: () => create("diagram") },
  { name: "ワークスペースを切り替える", action: () => void switchWorkspace() },
  {
    name: "表テンプレートを挿入",
    action: () =>
      insertIntoEditor(
        "\n\n| Field | Type | Description |\n| --- | --- | --- |\n| id | string | Identifier |\n\n",
      ),
  },
  {
    name: "コードブロックを挿入",
    action: () =>
      insertIntoEditor("\n\n```ts\n// Implementation context\n```\n\n"),
  },
  {
    name: "Callout を挿入",
    action: () =>
      insertIntoEditor("\n\n> [!NOTE]\n> Add a decision or constraint.\n\n"),
  },
  { name: "画像を挿入", action: () => imageInput?.click() },
  { name: "文書を Markdown として追加", action: () => navigateToDocumentImport() },
  { name: "ZIP を復元", action: () => importInput?.click() },
  { name: "開いている Markdown をダウンロード", action: downloadMarkdown },
  { name: "別の Markdown 文書と比較", action: openDiff },
  { name: "プレビューを印刷 / PDF 保存", action: printDocument },
];

onMount(() => {
  if (isNotFound) return;
  const boot = isLauncher
    ? undefined
    : window.setTimeout(() => void initialize(), 0);
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (!event.shiftKey) {
        if (isLauncher) focusLauncherSearch();
        else openLauncher();
        return;
      }
      if (!isLauncher) paletteOpen = true;
    }
    if (event.key === "Escape") {
      if (comparisonPickerOpen) {
        comparisonPickerOpen = false;
        return;
      }
      if (launcherOpen) {
        closeLauncher();
        return;
      }
      paletteOpen = false;
      deleteTarget = null;
    }
  };
  window.addEventListener("keydown", onKey);
  const refreshOnFocus = () => void refreshWorkspaceFromStorage();
  window.addEventListener("focus", refreshOnFocus);
  return () => {
    if (boot) clearTimeout(boot);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("focus", refreshOnFocus);
    workspaceSyncChannel?.close();
    Object.values(assetUrls).forEach(URL.revokeObjectURL);
    documentImportClient?.dispose();
    importController?.abort();
  };
});

$effect(() => {
  if (activeEntry?.kind !== "diagram" || DiagramEditor) return;
  void import("./lib/components/DiagramEditor.svelte").then((module) => {
    DiagramEditor = module.default;
  });
});

$effect(() => {
  if (!comparisonEntries.some((entry) => entry.id === compareEntryId))
    compareEntryId = comparisonEntries[0]?.id ?? "";
});

  async function initialize(): Promise<void> {
    try {
      repository = createWorkspaceRepository();
      try {
        await importLegacyOpfsWorkspaces(repository);
        workspace = await repository.open();
      } catch {
        repository = createFallbackWorkspaceRepository();
        workspace = await repository.open();
        status = "SQLite を利用できないため互換保存モードで動作中";
      }
      workspace = await migrateLoadedWorkspace(workspace);
      startWorkspaceSync();
    const requestedEntryId = new URLSearchParams(window.location.search).get("entry");
    activeEntryId =
      (requestedEntryId && activeEntries(workspace).some((entry) => entry.id === requestedEntryId)
        ? requestedEntryId
        : workspace.lastOpenedEntryId) ??
      activeEntries(workspace).find(
        (entry) => entry.path === "docs/overview.md",
      )?.id ??
      activeEntries(workspace).find((entry) => entry.kind === "markdown")?.id ??
      null;
    expanded = new Set(
      activeEntries(workspace)
        .filter((entry) => entry.kind === "folder")
        .map((entry) => entry.id),
    );
      await hydrateAssets();
      status = "複数タブ同期モードで動作中";
  } catch (error) {
    statusTone = "error";
    status =
      "保存領域を開けませんでした。ブラウザのサイトデータ設定を確認してください。";
    toast = error instanceof Error ? error.message : status;
  }
}

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

function startWorkspaceSync(): void {
  if (typeof BroadcastChannel === "undefined") return;
  workspaceSyncChannel = new BroadcastChannel("uft-workspace-sync");
  workspaceSyncChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
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
    void refreshWorkspaceFromStorage(message.workspaceId);
  });
}

function announceWorkspaceSave(workspaceId: string): void {
  workspaceSyncChannel?.postMessage({ source: tabId, workspaceId });
}

async function refreshWorkspaceFromStorage(workspaceId = workspace?.id): Promise<void> {
  if (!workspaceId || !workspace || !repository || workspace.id !== workspaceId || synchronizingWorkspace)
    return;
  synchronizingWorkspace = true;
  try {
    const stored = await repository.open(workspaceId);
    const next = mergeWorkspaces(stored, workspace);
    if (JSON.stringify(next) !== JSON.stringify(workspace)) {
      workspace = next;
      await hydrateAssets();
      status = "別のタブの変更を同期しました";
      statusTone = "info";
    }
  } catch (error) {
    notify(error);
  } finally {
    synchronizingWorkspace = false;
  }
}

async function hydrateAssets(): Promise<void> {
  if (!workspace || !repository) return;
  const next: Record<string, string> = {};
  for (const asset of workspace.assets) {
    const bytes = await repository.getAsset(asset.id);
    if (bytes)
      next[asset.path] = URL.createObjectURL(
        new Blob([bytes], { type: asset.mediaType }),
      );
  }
  Object.values(assetUrls).forEach(URL.revokeObjectURL);
  assetUrls = next;
}

async function switchWorkspace(): Promise<void> {
  if (!repository) return;
  const choices = await repository.listWorkspaces();
  const selected = window.prompt(
    `開くワークスペースの ID を入力してください。\n${choices.map((item) => `${item.name} (${item.id})`).join("\n")}`,
    workspace?.id ?? "",
  );
  if (!selected || selected === workspace?.id) return;
  try {
    workspace = await migrateLoadedWorkspace(await repository.open(selected));
    activeEntryId = workspace.lastOpenedEntryId ?? activeEntries(workspace).find((entry) => entry.kind === "markdown")?.id ?? null;
    expanded = new Set(activeEntries(workspace).filter((entry) => entry.kind === "folder").map((entry) => entry.id));
    await hydrateAssets();
    if (!(await saveNow())) return;
    status = `「${workspace.name}」を開きました`;
  } catch (error) {
    notify(error);
  }
}

function flattenEntries(
  current: Workspace,
  parentId: string | null = null,
  depth = 0,
): Array<{ entry: WorkspaceEntry; depth: number }> {
  const result: Array<{ entry: WorkspaceEntry; depth: number }> = [];
  for (const entry of orderedChildren(current, parentId)) {
    result.push({ entry, depth });
    if (entry.kind === "folder" && expanded.has(entry.id))
      result.push(...flattenEntries(current, entry.id, depth + 1));
  }
  return result;
}

function selectEntry(entry: WorkspaceEntry): void {
  if (entry.kind === "folder") {
    const next = new Set(expanded);
    next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
    expanded = next;
    return;
  }
  activeEntryId = entry.id;
  if (workspace) {
    workspace.lastOpenedEntryId = entry.id;
    scheduleSave();
  }
}

function canWrite(): boolean {
  return true;
}

function create(kind: EntryKind): void {
  if (!workspace || !canWrite()) return;
  const parentId =
    activeEntry?.kind === "folder"
      ? activeEntry.id
      : (activeEntry?.parentId ?? null);
  const label =
    kind === "folder"
      ? "フォルダ名"
      : kind === "diagram"
        ? "図表名"
        : "Markdown 文書名";
  const defaultName =
    kind === "folder"
      ? "New folder"
      : kind === "diagram"
        ? "New diagram"
        : "untitled.md";
  const name = window.prompt(label, defaultName);
  if (!name) return;
    try {
      const entry = createEntry(
      workspace,
      kind,
      parentId,
      kind === "markdown" && !name.endsWith(".md") ? `${name}.md` : name,
      );
      if (kind === "diagram") {
        const template = window.prompt(
          "テンプレートを選択してください: flow / architecture / er",
          "flow",
        );
        const diagram = workspace.diagrams[entry.id];
        if (diagram) {
          const labels =
            template === "architecture"
              ? ["Client", "Gateway", "Service", "Database"]
              : template === "er"
                ? ["User", "Order", "Item"]
                : ["Start", "Review", "Finish"];
          diagram.graph.nodes = labels.map((label, index) => ({
            id: `node-${index + 1}`,
            position: { x: 70 + index * 210, y: 100 },
            data: { label },
          }));
          diagram.graph.edges = labels.slice(1).map((_, index) => ({
            id: `edge-${index + 1}`,
            source: `node-${index + 1}`,
            target: `node-${index + 2}`,
          }));
        }
      }
      activeEntryId = entry.id;
    if (parentId) expanded = new Set(expanded).add(parentId);
    scheduleSave();
  } catch (error) {
    notify(error);
  }
}

function rename(): void {
  if (!workspace || !activeEntry || !canWrite()) return;
  const name = window.prompt("新しい名前", activeEntry.name);
  if (!name) return;
  try {
    renameEntry(workspace, activeEntry.id, name);
    scheduleSave();
  } catch (error) {
    notify(error);
  }
}

function dragEntry(event: DragEvent, entry: WorkspaceEntry): void {
  if (!canWrite()) {
    event.preventDefault();
    return;
  }
  draggingEntryId = entry.id;
  event.dataTransfer?.setData("application/x-uft-entry", entry.id);
  event.dataTransfer?.setData("text/plain", entry.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function draggedEntryId(event: DragEvent): string | null {
  return (
    draggingEntryId ??
    event.dataTransfer?.getData("application/x-uft-entry") ??
    event.dataTransfer?.getData("text/plain") ??
    null
  );
}

function canDropEntry(event: DragEvent, parentId: string | null): boolean {
  if (!workspace) return false;
  const entryId = draggedEntryId(event);
  if (!entryId) return false;
  const entry = activeEntries(workspace).find((candidate) => candidate.id === entryId);
  return Boolean(
    entry && entry.parentId !== parentId && canMoveEntry(workspace, entryId, parentId),
  );
}

function showDropTarget(event: DragEvent, parentId: string | null): void {
  if (!canDropEntry(event, parentId)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropTargetId = parentId;
}

function clearDropTarget(): void {
  dropTargetId = null;
}

function dropEntry(event: DragEvent, parentId: string | null): void {
  if (!canDropEntry(event, parentId) || !workspace || !canWrite()) return;
  event.preventDefault();
  const entryId = draggedEntryId(event);
  if (!entryId) return;
  try {
    const entry = moveEntry(workspace, entryId, parentId);
    if (parentId) expanded = new Set(expanded).add(parentId);
    status = `${entry.name} を ${parentId ? entry.path.slice(0, -(entry.name.length + 1)) : "ワークスペースのルート"} に移動しました`;
    scheduleSave();
  } catch (error) {
    notify(error);
  } finally {
    draggingEntryId = null;
    clearDropTarget();
  }
}

function editDocument(content: string): void {
  if (
    !workspace ||
    !activeEntry ||
    activeEntry.kind !== "markdown" ||
    !canWrite()
  )
    return;
  updateDocument(workspace, activeEntry.id, content);
  scheduleSave();
}
function openDiff(): void {
  if (!comparisonEntries.length) {
    notify(new Error("比較するには、もう1つ Markdown 文書を作成してください。"));
    return;
  }
  if (!comparisonEntries.some((entry) => entry.id === compareEntryId))
    compareEntryId = comparisonEntries[0].id;
  mode = "diff";
}
function toggleComparisonPicker(): void {
  comparisonPickerOpen = !comparisonPickerOpen;
  comparisonQuery = "";
  comparisonActiveIndex = Math.max(
    0,
    comparisonEntries.findIndex((entry) => entry.id === compareEntryId),
  );
  if (comparisonPickerOpen)
    window.setTimeout(() => comparisonSearchInput?.focus(), 0);
}
function chooseComparisonEntry(entryId: string): void {
  compareEntryId = entryId;
  comparisonPickerOpen = false;
  comparisonQuery = "";
}
function handleComparisonSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    comparisonActiveIndex = Math.min(
      comparisonActiveIndex + 1,
      matchingComparisonEntries.length - 1,
    );
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    comparisonActiveIndex = Math.max(comparisonActiveIndex - 1, 0);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const selected = matchingComparisonEntries[comparisonActiveIndex];
    if (selected) chooseComparisonEntry(selected.id);
    return;
  }
  if (event.key === "Escape") {
    comparisonPickerOpen = false;
    comparisonPickerButton?.focus();
  }
}
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  status = "保存待ち";
  saveTimer = setTimeout(() => void saveNow(), 500);
}
async function saveNow(): Promise<boolean> {
  if (!workspace || !repository) return false;
  if (saveTimer) clearTimeout(saveTimer);
  try {
    status = "保存中…";
    const localSnapshot = cloneWorkspace(workspace);
    localSnapshot.updatedAt = new Date().toISOString();
    const save = async (): Promise<Workspace> => {
      const stored = await repository?.open(localSnapshot.id);
      const merged = stored
        ? mergeWorkspaces(stored, localSnapshot)
        : localSnapshot;
      await repository?.save(merged);
      return merged;
    };
    const saved = "locks" in navigator
      ? await navigator.locks.request("uft-workspace-save", save)
      : await save();
    // Do not discard text entered while the asynchronous write was running.
    workspace = mergeWorkspaces(saved, workspace);
    announceWorkspaceSave(saved.id);
    status = "保存済み";
    statusTone = "info";
    return true;
  } catch (error) {
    status = "保存に失敗しました";
    statusTone = "error";
    notify(error);
    return false;
  }
}
function notify(error: unknown): void {
  toast = error instanceof Error ? error.message : "操作に失敗しました。";
  window.setTimeout(() => (toast = ""), 5000);
}

function diagramAssetPath(entry: WorkspaceEntry): string {
  const label = entry.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "diagram";
  return `assets/diagrams/${label}-${entry.id}.svg`;
}

async function addImage(file: File): Promise<void> {
  if (
    !workspace ||
    !repository ||
    !activeEntry ||
    activeEntry.kind !== "markdown" ||
    !canWrite()
  )
    return;
  const targetWorkspace = workspace;
  const targetEntry = activeEntry;
  try {
    if (
      !/^image\/(png|jpeg|gif|webp)$/.test(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      throw new Error(
        "PNG / JPEG / GIF / WebP の 20 MB 以下の画像を選択してください。",
      );
    }
    const base = file.name.replace(/[^\w.()-]/g, "-");
    let path = `assets/${base}`;
    let index = 2;
    while (targetWorkspace.assets.some((asset) => asset.path === path))
      path = `assets/${base.replace(/(\.[^.]+)?$/, `-${index++}$1`)}`;
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    if (workspace !== targetWorkspace)
      throw new Error("ワークスペースを切り替えたため、画像の追加を中止しました。");
    const asset: Asset = {
      id: newId("asset"),
      workspaceId: targetWorkspace.id,
      path,
      mediaType: file.type,
      byteSize: file.size,
      checksum: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      createdAt: new Date().toISOString(),
    };
    await repository.putAsset(asset, bytes);
    if (workspace !== targetWorkspace) {
      await repository.deleteAsset(asset.id);
      throw new Error("ワークスペースを切り替えたため、画像の追加を中止しました。");
    }
    targetWorkspace.assets.push(asset);
    assetUrls = { ...assetUrls, [path]: URL.createObjectURL(file) };
    const insertion = `![${file.name}](${relativeAssetPath(targetEntry.path, path)})`;
    if (activeEntry?.id === targetEntry.id) insertIntoEditor(insertion);
    else {
      const document = targetWorkspace.documents[targetEntry.id];
      if (!document) throw new Error("追加先の文書が見つかりません。");
      updateDocument(targetWorkspace, targetEntry.id, `${document.content}\n\n${insertion}`);
      toast = "画像は、追加を開始した文書の末尾に挿入しました。";
    }
    scheduleSave();
  } catch (error) {
    notify(error);
  }
}

async function saveDiagram(
  diagram: import("./lib/domain/workspace").DiagramDocument,
): Promise<boolean> {
  if (
    !workspace ||
    !repository ||
    !activeEntry ||
    activeEntry.kind !== "diagram" ||
    !canWrite()
  )
    return false;
  const targetWorkspace = workspace;
  const entry = activeEntry;
  const saveKey = `${targetWorkspace.id}:${entry.id}`;
  const saveVersion = (diagramSaveVersions.get(saveKey) ?? 0) + 1;
  diagramSaveVersions.set(saveKey, saveVersion);
  const svg = graphToSvg(diagram.graph);
  const bytes = new TextEncoder().encode(svg);
  let asset = diagram.previewAssetId
    ? targetWorkspace.assets.find((candidate) => candidate.id === diagram.previewAssetId)
    : undefined;
  const path = asset?.path ?? diagramAssetPath(entry);
  asset ??= targetWorkspace.assets.find((candidate) => candidate.path === path);
  if (!asset) {
    asset = { id: newId("asset"), workspaceId: targetWorkspace.id, path, mediaType: "image/svg+xml", byteSize: bytes.byteLength, checksum: "", createdAt: new Date().toISOString() };
    targetWorkspace.assets.push(asset);
  }
  asset.byteSize = bytes.byteLength;
  asset.checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const result = graphToMermaid(diagram.graph);
  const updatedAt = new Date().toISOString();
  targetWorkspace.diagrams[entry.id] = {
    ...diagram,
    previewAssetId: asset.id,
    mermaidSource: result.source ?? null,
    updatedAt,
  };
  entry.updatedAt = updatedAt;
  try {
    // Keep a separate copy for the immediate preview URL while IndexedDB saves
    // the original bytes for the other tabs.
    await repository.putAsset(asset, bytes.slice().buffer);
    if (
      workspace !== targetWorkspace ||
      saveVersion !== diagramSaveVersions.get(saveKey)
    )
      return true;
    const previousUrl = assetUrls[path];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    assetUrls = {
      ...assetUrls,
      [path]: URL.createObjectURL(
        new Blob([bytes], { type: asset.mediaType }),
      ),
    };
    scheduleSave();
    return true;
  } catch (error) {
    if (
      workspace === targetWorkspace &&
      saveVersion === diagramSaveVersions.get(saveKey)
    ) {
      status = "SVG の保存に失敗しました";
      statusTone = "error";
      notify(error);
    }
    return false;
  }
}

async function insertDiagramReference(): Promise<void> {
  if (
    !workspace ||
    !activeEntry ||
    activeEntry.kind !== "diagram" ||
    !canWrite()
  )
    return;
  const targetWorkspace = workspace;
  const entry = activeEntry;
  const diagram = activeDiagram;
  if (!diagram || !(await saveDiagram(diagram))) return;
  if (workspace !== targetWorkspace || activeEntryId !== entry.id) return;
  const path = targetWorkspace.assets.find(
    (asset) => asset.id === targetWorkspace.diagrams[entry.id]?.previewAssetId,
  )?.path;
  if (!path) {
    notify(new Error("SVG を保存してから Markdown に挿入してください。"));
    return;
  }
  const document = activeEntries(targetWorkspace).find((item) => item.kind === "markdown");
  if (!document) return;
  activeEntryId = document.id;
  pendingEditorInsertion = `![${entry.name}](<${relativeAssetPath(document.path, path)}>)`;
}

function setEditorInsertionHandler(handler: (text: string) => void): void {
  insertIntoEditor = handler;
  if (!pendingEditorInsertion) return;
  handler(pendingEditorInsertion);
  pendingEditorInsertion = null;
}

async function backup(): Promise<void> {
  if (!workspace || !repository) return;
  if (!(await saveNow())) return;
  try {
    download(
      await exportWorkspace(workspace, repository),
      `${workspace.name.replace(/[^\w-]+/g, "-") || "uft-workspace"}.zip`,
    );
    status = "ZIP バックアップをダウンロードしました";
  } catch (error) {
    notify(error);
  }
}
async function restore(file: File): Promise<void> {
  if (!repository || !canWrite()) return;
  try {
    const imported = await importWorkspace(file);
    for (const [id, bytes] of imported.binaries) {
      const asset = imported.workspace.assets.find(
        (candidate) => candidate.id === id,
      );
      if (asset) await repository.putAsset(asset, bytes);
    }
    workspace = imported.workspace;
    activeEntryId = workspace.lastOpenedEntryId;
    expanded = new Set(
      activeEntries(workspace)
        .filter((entry) => entry.kind === "folder")
        .map((entry) => entry.id),
    );
    if (!(await saveNow())) return;
    await hydrateAssets();
    status = "新しいワークスペースとして復元しました";
  } catch (error) {
    notify(error);
  } finally {
    if (importInput) importInput.value = "";
  }
}
function downloadMarkdown(): void {
  if (!activeEntry || !activeDocument) return;
  try {
    download(
      new Blob([activeDocument.content], {
        type: "text/markdown;charset=utf-8",
      }),
      activeEntry.name,
    );
    status = "Markdown をダウンロードしました";
    statusTone = "info";
  } catch (error) {
    notify(error);
  }
}
function printDocument(): void {
  mode = "preview";
  window.setTimeout(() => window.print(), 150);
}
function remove(): void {
  if (!workspace || !deleteTarget || !canWrite()) return;
  deletedIds = softDeleteEntry(workspace, deleteTarget.id).map(
    (entry) => entry.id,
  );
  deleteTarget = null;
  activeEntryId =
    activeEntries(workspace).find((entry) => entry.kind === "markdown")?.id ??
    null;
  scheduleSave();
  toast = "削除しました。取り消すにはここをクリック";
}
function undoDelete(): void {
  if (!workspace || !deletedIds.length || !canWrite()) return;
  restoreEntries(workspace, deletedIds);
  deletedIds = [];
  scheduleSave();
  toast = "削除を取り消しました";
}
function command(action: () => void): void {
  paletteOpen = false;
  action();
}

function navigateToDocumentImport(): void {
  window.location.assign("/convert-to-markdown");
}

function focusLauncherSearch(): void {
  launcherSearchInput?.focus();
}

function openLauncher(): void {
  launcherQuery = "";
  launcherSelectedIndex = 0;
  launcherOpen = true;
  window.setTimeout(focusLauncherSearch, 0);
}

function closeLauncher(): void {
  launcherOpen = false;
  launcherQuery = "";
}

function handleLauncherSearchKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeLauncher();
    return;
  }
  if (event.key === "ArrowDown" && matchingLauncherTools.length) {
    event.preventDefault();
    launcherSelectedIndex = Math.min(
      launcherSelectedIndex + 1,
      matchingLauncherTools.length - 1,
    );
    return;
  }
  if (event.key === "ArrowUp" && matchingLauncherTools.length) {
    event.preventDefault();
    launcherSelectedIndex = Math.max(launcherSelectedIndex - 1, 0);
    return;
  }
  if (event.key === "Enter" && matchingLauncherTools.length) {
    event.preventDefault();
    const selected =
      matchingLauncherTools[launcherSelectedIndex] ?? matchingLauncherTools[0];
    if (selected) window.location.assign(selected.href);
  }
}

function cancelDocumentImport(): void {
  importController?.abort();
}

async function importSelectedDocuments(files: FileList | null): Promise<void> {
  if (!workspace || !files?.length || importingDocuments || !canWrite()) return;
  importingDocuments = true;
  documentImportResults = [];
  completedImportEntry = null;
  documentImportProgress = { completed: 0, total: files.length };
  importController = new AbortController();
  documentImportClient ??= new AnyDocClient();
  try {
    const results = await importDocuments({
      workspace,
      files: Array.from(files),
      signal: importController.signal,
      convert: (file, format, signal) =>
        documentImportClient?.convert(file, format, signal) ??
        Promise.reject(new Error("変換機能を開始できませんでした。")),
      onProgress: (progress) => (documentImportProgress = progress),
    });
    documentImportResults = results;
    const imported = results.filter((result) => result.status === "imported");
    if (imported.length) {
      const firstEntry = imported[0]?.entry;
      if (firstEntry) activeEntryId = firstEntry.id;
      if (!(await saveNow())) return;
      status = `${imported.length} 件の文書を imports/ に追加しました`;
      completedImportEntry = firstEntry ?? null;
      if (firstEntry && results.every((result) => result.status === "imported"))
        window.setTimeout(() => {
          if (completedImportEntry?.id === firstEntry.id && !importingDocuments)
            window.location.assign(
              `/workspace?entry=${encodeURIComponent(firstEntry.id)}`,
            );
        }, 1_200);
    }
  } catch (error) {
    notify(error);
  } finally {
    importingDocuments = false;
    importController = undefined;
    if (documentImportInput) documentImportInput.value = "";
  }
}

function openImportedDocument(): void {
  if (!completedImportEntry) return;
  window.location.assign(
    `/workspace?entry=${encodeURIComponent(completedImportEntry.id)}`,
  );
}
</script>

<svelte:head><title>UFT — Markdown workspace</title><meta name="description" content="A local-first workspace for Markdown design documents." /><meta name="theme-color" content="#2d4932" /><link rel="icon" href="/icon.svg" type="image/svg+xml" /><link rel="manifest" href="/manifest.webmanifest" /></svelte:head>

{#if isNotFound}
  <ErrorPage
    code="404"
    title="ページが見つかりません"
    description="URLをご確認のうえ、ホームから目的のツールを選択してください。"
  />
{:else if isLauncher}
  <main class="launcher-page">
    <header class="launcher-topbar">
      <div class="brand"><span class="brand-mark">u</span><span>uft</span></div>
      <span>LOCAL-FIRST TOOLKIT</span>
    </header>
    <section class="launcher-content" aria-labelledby="launcher-title">
      <p class="eyebrow">WORKSPACE LAUNCHER</p>
      <h1 id="launcher-title">作業を始めるツールを選択</h1>
      <p class="launcher-lead">UFT のツールはすべてこのブラウザ内で動作します。ここへ新しいツールを追加していけます。</p>
      <label class="launcher-search">
        <span>ツールを検索 <kbd>⌘ K</kbd></span>
        <input bind:this={launcherSearchInput} bind:value={launcherQuery} oninput={() => launcherSelectedIndex = 0} onkeydown={handleLauncherSearchKeydown} placeholder="ツール名や機能で検索…" autocomplete="off" />
      </label>
      <div class="tool-launcher-grid">
        {#each matchingLauncherTools as tool (tool.id)}
          <a class="tool-launcher-card" href={tool.href}>
            <span class="tool-icon"><tool.icon aria-hidden="true" /></span>
            <span class="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
            <ArrowRight class="tool-arrow" aria-hidden="true" />
          </a>
        {:else}
          <p class="launcher-empty">一致するツールはありません。別のキーワードで検索してください。</p>
        {/each}
      </div>
      <p class="launcher-footnote">新しいツールはこのランチャーから追加・起動できる設計です。</p>
    </section>
  </main>
{:else}
<main class:document-import-page={isDocumentImport} class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark">u</span><span>uft</span></div>
    <div class="document-chip">{isDocumentImport ? "文書を Markdown に変換" : documentTitle}</div>
    <div class="top-actions">
      {#if isDocumentImport}
        <a class="top-link" href="/">ホームへ戻る</a>
      {:else}
        <a class="top-link button-with-icon" href="/"><House aria-hidden="true" />ホーム</a><button class="button-with-icon" onclick={navigateToDocumentImport}><FileInput aria-hidden="true" />文書を変換</button><button class="button-with-icon" onclick={() => paletteOpen = true} disabled={!workspace}><Command aria-hidden="true" />コマンド <kbd>⌘ ⇧ K</kbd></button><button class="button-with-icon" onclick={backup} disabled={!workspace}><Download aria-hidden="true" />ZIP バックアップ</button><button class="save-button button-with-icon" onclick={saveNow} disabled={!workspace}><Save aria-hidden="true" />保存 <kbd>⌘ S</kbd></button>
      {/if}
    </div>
  </header>
  {#if isDocumentImport}
    <section class="document-import-shell" aria-labelledby="document-import-title">
      <div class="document-import-card">
        <p class="eyebrow">LOCAL CONVERSION</p>
        <h1 id="document-import-title">文書を Markdown に変換</h1>
        <p>選択したファイルはこのブラウザ内の Worker だけで処理されます。元ファイルは保存せず、編集可能な Markdown を <code>imports/</code> に追加します。</p>
        <button class="import-picker button-with-icon" onclick={() => documentImportInput?.click()} disabled={importingDocuments || !workspace}><Files aria-hidden="true" />複数の文書を選択</button>
        <p class="import-hint">Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、テキスト PDF に対応。1 ファイル 50 MB、合計 200 MB まで。</p>
        {#if importingDocuments}
          <div class="import-progress" role="status">
            <div><strong>{documentImportProgress.completed} / {documentImportProgress.total}</strong> 件を処理中{#if documentImportProgress.currentName}：{documentImportProgress.currentName}{/if}</div>
            <progress value={documentImportProgress.completed} max={documentImportProgress.total}></progress>
            <button class="button-with-icon" onclick={cancelDocumentImport}><X aria-hidden="true" />キャンセル</button>
          </div>
        {/if}
        {#if documentImportResults.length}
          <section class="import-results" aria-live="polite">
            <h2>{documentImportResults.filter((result) => result.status === "imported").length} 件を追加しました</h2>
            <ul>
              {#each documentImportResults as result, index (index)}
                <li class:failed={result.status === "failed"} class:cancelled={result.status === "cancelled"}>
                  <span class="import-result-icon" aria-hidden="true">{#if result.status === "imported"}<CircleCheck />{:else if result.status === "cancelled"}<Minus />{:else}<CircleAlert />{/if}</span>
                  <div><strong>{result.file.name}</strong><small>{result.status === "imported" ? `${result.entry?.path} として追加しました` : result.reason}</small></div>
                </li>
              {/each}
            </ul>
            {#if completedImportEntry}
              <button class="open-imported-document button-with-icon" onclick={openImportedDocument}>変換した文書を開く<ArrowRight aria-hidden="true" /></button>
            {/if}
          </section>
        {/if}
      </div>
    </section>
  {:else}
  <section class="workspace">
    <aside class="sidebar" aria-label="Explorer">
      <div class="sidebar-title"><span>EXPLORER</span><span><button aria-label="新しい文書" onclick={() => create("markdown")} disabled={!workspace}><FilePlus aria-hidden="true" /></button><button aria-label="新しいフォルダ" onclick={() => create("folder")} disabled={!workspace}><FolderPlus aria-hidden="true" /></button></span></div>
      {#if workspace}
        <div
          class:drop-target={dropTargetId === null && draggingEntryId !== null}
          class="root-drop-target"
          role="group"
          aria-label="ワークスペースのルートにドロップ"
          ondragover={(event) => showDropTarget(event, null)}
          ondragleave={clearDropTarget}
          ondrop={(event) => dropEntry(event, null)}
        >ワークスペースのルートにドロップ</div>
        {#each visibleEntries as { entry, depth } (entry.id)}
          <button
            class:active={entry.id === activeEntryId}
            class:dragging={entry.id === draggingEntryId}
            class:drop-target={entry.kind === "folder" && entry.id === dropTargetId}
            class="tree-item"
            data-entry-id={entry.id}
            data-entry-path={entry.path}
            draggable={true}
            style={`padding-left:${9 + depth * 16}px`}
            title="ドラッグしてフォルダへ移動"
            ondragstart={(event) => dragEntry(event, entry)}
            ondragend={() => { draggingEntryId = null; clearDropTarget(); }}
            ondragover={entry.kind === "folder" ? (event) => showDropTarget(event, entry.id) : undefined}
            ondragleave={entry.kind === "folder" ? clearDropTarget : undefined}
            ondrop={entry.kind === "folder" ? (event) => dropEntry(event, entry.id) : undefined}
            onclick={() => selectEntry(entry)}
          ><span class="tree-icon" aria-hidden="true">{#if entry.kind === "folder"}{#if expanded.has(entry.id)}<ChevronDown />{:else}<ChevronRight />{/if}{:else if entry.kind === "diagram"}<Workflow />{:else}<FileText />{/if}</span><span>{entry.name}</span></button>
        {/each}
      {:else}<p class="loading-tree">読み込み中…</p>{/if}
      <div class="sidebar-actions"><button aria-label="名前変更" title="名前変更" onclick={rename} disabled={!activeEntry}><Pencil aria-hidden="true" /></button><button aria-label="削除" title="削除" onclick={() => deleteTarget = activeEntry} disabled={!activeEntry}><Trash2 aria-hidden="true" /></button></div>
    </aside>
    <section class="main-pane">
      <div class="editor-toolbar"><div class="mode-switch"><button class:selected={mode === "source"} onclick={() => mode = "source"} disabled={!activeDocument}>Source</button><button class:selected={mode === "split"} onclick={() => mode = "split"} disabled={!activeDocument}>Split</button><button class:selected={mode === "preview"} onclick={() => mode = "preview"} disabled={!activeDocument}>Preview</button><button class:selected={mode === "diff"} onclick={openDiff} disabled={!activeDocument}>Diff</button></div>{#if mode === "diff" && comparisonEntries.length}<div class="diff-selector"><span>比較元</span><button bind:this={comparisonPickerButton} type="button" class="diff-selector-trigger" aria-label={`比較元: ${compareEntry?.path ?? "未選択"}`} aria-haspopup="listbox" aria-expanded={comparisonPickerOpen} onclick={toggleComparisonPicker}><span>{compareEntry?.path ?? "文書を選択"}</span><ChevronDown aria-hidden="true" /></button>{#if comparisonPickerOpen}<div class="diff-picker-popover"><input bind:this={comparisonSearchInput} bind:value={comparisonQuery} aria-label="比較元を検索" aria-controls="comparison-picker-results" aria-activedescendant={matchingComparisonEntries[comparisonActiveIndex] ? `comparison-option-${matchingComparisonEntries[comparisonActiveIndex].id}` : undefined} placeholder="文書を検索…" autocomplete="off" oninput={() => comparisonActiveIndex = 0} onkeydown={handleComparisonSearchKeydown} /><div id="comparison-picker-results" class="diff-picker-results" role="listbox" aria-label="比較元の候補">{#each matchingComparisonEntries as entry, index (entry.id)}<button id={`comparison-option-${entry.id}`} type="button" role="option" class:active={index === comparisonActiveIndex} aria-selected={entry.id === compareEntryId} onmouseenter={() => comparisonActiveIndex = index} onclick={() => chooseComparisonEntry(entry.id)}>{entry.path}</button>{:else}<p>一致する Markdown 文書はありません。</p>{/each}</div></div>{/if}</div>{/if}<span class:error-text={statusTone === "error"} class="status"><span class="local-dot"></span>{status}</span></div>
      {#if activeMarkdown}
        {#if mode === "diff"}
          <section class="diff-pane" aria-label="Markdown comparison">
            {#if compareEntry && compareDocument}
              <header class="diff-heading"><span>{compareEntry.path}</span><ArrowRight aria-hidden="true" /><strong>{activeMarkdown.entry.path}</strong></header>
              <MarkdownDiff before={compareDocument.content} after={activeMarkdown.document.content} />
            {:else}
              <p class="diff-empty">比較する Markdown 文書を選択してください。</p>
            {/if}
          </section>
        {:else}
          <div class:source-only={mode === "source"} class:preview-only={mode === "preview"} class="document-area">
            {#if mode !== "preview"}<section class="source-pane">{#key activeMarkdown.entry.id}<CodeMirrorEditor value={activeMarkdown.document.content} onChange={editDocument} onReady={setEditorInsertionHandler} />{/key}<output class="markdown-character-count" data-testid="markdown-character-count" aria-live="polite">文字数: {markdownCharacterCount.toLocaleString()}（改行を含む）</output></section>{/if}
            {#if mode !== "source"}<section class="preview-pane"><MarkdownPreview markdown={activeMarkdown.document.content} {assetUrls} documentPath={activeMarkdown.entry.path} /></section>{/if}
          </div>
        {/if}
      {:else if activeEntry?.kind === "diagram" && activeDiagram}
        <section class="diagram-workspace"><div class="diagram-heading"><div><p class="eyebrow">DIAGRAM</p><h1>{activeEntry.name}</h1></div><button class="button-with-icon" onclick={insertDiagramReference}><FileOutput aria-hidden="true" />Markdown に SVG を挿入</button></div>{#if DiagramEditor}<DiagramEditor diagram={activeDiagram} onChange={saveDiagram} />{:else}<p>図表エディタを読み込んでいます…</p>{/if}</section>
      {:else}<section class="setup-card"><p class="eyebrow">LOCAL-FIRST</p><h1>文書を選択、または新規作成してください。</h1><p>データはこのブラウザ内に保存されます。定期的に ZIP バックアップを作成してください。</p></section>{/if}
    </section>
  </section>
  <footer class="footer"><span>Markdown · Local-first · Offline</span><span>{activeMarkdown?.document.content.trim().split(/\s+/).filter(Boolean).length ?? 0} words · UTF-8</span></footer>
  {/if}
</main>

<input bind:this={documentImportInput} hidden type="file" multiple accept={documentAccept} onchange={(event) => void importSelectedDocuments(event.currentTarget.files)} />
<input bind:this={imageInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void addImage(file); event.currentTarget.value = ""; }} />
<input bind:this={importInput} hidden type="file" accept="application/zip,.zip" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void restore(file); }} />
{#if paletteOpen}<div class="palette-scrim"><dialog open class="palette" aria-label="Command palette"><input bind:value={query} placeholder="コマンドを検索…" />{#each commands as commandItem}{#if !query || commandItem.name.includes(query)}<button onclick={() => command(commandItem.action)}>{commandItem.name}</button>{/if}{/each}</dialog></div>{/if}
<ConfirmDialog open={Boolean(deleteTarget)} title="項目を削除しますか？" detail={deleteTarget ? `「${deleteTarget.path}」とその子項目をこのセッションから削除します。` : ""} onCancel={() => deleteTarget = null} onConfirm={remove} />
{#if toast}<button class="undo-toast button-with-icon" onclick={undoDelete}><Undo2 aria-hidden="true" />{toast}</button>{/if}<Toast message="" />
{#if launcherOpen}
  <div class="tool-launcher-scrim">
    <dialog open class="tool-launcher-dialog" aria-label="ツールランチャー">
      <label class="tool-launcher-search">
        <span>ツールを検索 <kbd>Esc</kbd></span>
        <input bind:this={launcherSearchInput} bind:value={launcherQuery} oninput={() => launcherSelectedIndex = 0} onkeydown={handleLauncherSearchKeydown} placeholder="ツール名や機能で検索…" autocomplete="off" />
      </label>
      <div class="tool-launcher-results">
        {#each matchingLauncherTools as tool, index (tool.id)}
          <a class:selected={launcherSelectedIndex === index} class="tool-launcher-result" href={tool.href} onmouseenter={() => launcherSelectedIndex = index}>
            <span class="tool-icon"><tool.icon aria-hidden="true" /></span>
            <span class="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
            <kbd>↵</kbd>
          </a>
        {:else}
          <p class="tool-launcher-empty">一致するツールはありません。</p>
        {/each}
      </div>
      <footer><span>↑↓ 選択</span><span>↵ 開く</span><span>Esc 閉じる</span></footer>
    </dialog>
  </div>
{/if}
{/if}
