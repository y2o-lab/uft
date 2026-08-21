<script lang="ts">
import { onMount } from "svelte";
import CodeMirrorEditor from "./lib/components/CodeMirrorEditor.svelte";
import ConfirmDialog from "./lib/components/ConfirmDialog.svelte";
import MarkdownPreview from "./lib/components/MarkdownPreview.svelte";
import MarkdownDiff from "./lib/components/MarkdownDiff.svelte";
import Toast from "./lib/components/Toast.svelte";
import { activeEntries, orderedChildren } from "./lib/domain/tree";
import {
  type Asset,
  type EntryKind,
  newId,
  type Workspace,
  type WorkspaceEntry,
} from "./lib/domain/workspace";
import { relativeAssetPath } from "./lib/markdown/preview";
import {
  createFallbackWorkspaceRepository,
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
type AppPage = "launcher" | "workspace" | "document-import";
type LauncherTool = {
  id: string;
  href: string;
  icon: string;
  name: string;
  description: string;
};

function currentPage(): AppPage {
  if (window.location.pathname === "/convert-to-markdown")
    return "document-import";
  if (window.location.pathname === "/workspace") return "workspace";
  return "launcher";
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
let assetUrls = $state<Record<string, string>>({});
let insertIntoEditor: (text: string) => void = () => undefined;
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
let launcherQuery = $state("");
let launcherSearchInput = $state<HTMLInputElement>();
let launcherOpen = $state(false);
let launcherSelectedIndex = $state(0);
let writerMode = $state<"writer" | "read-only" | "unavailable">("unavailable");
let releaseWriterLock: (() => void) | undefined;
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
    icon: "▤",
    name: "Markdown ワークスペース",
    description: "文書の作成、編集、プレビュー、ZIP バックアップ",
  },
  {
    id: "document-import",
    href: "/convert-to-markdown",
    icon: "↯",
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
  return () => {
    if (boot) clearTimeout(boot);
    window.removeEventListener("keydown", onKey);
    Object.values(assetUrls).forEach(URL.revokeObjectURL);
    documentImportClient?.dispose();
    importController?.abort();
    releaseWriterLock?.();
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
        workspace = await repository.open();
      } catch {
        repository = createFallbackWorkspaceRepository();
        workspace = await repository.open();
        status = "SQLite を利用できないため互換保存モードで動作中";
      }
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
      acquireWriterLock();
      status =
      repository.mode === "opfs-sqlite"
        ? "このブラウザに安全に保存されます"
        : "互換保存モードで動作中";
  } catch (error) {
    statusTone = "error";
    status =
      "保存領域を開けませんでした。ブラウザのサイトデータ設定を確認してください。";
    toast = error instanceof Error ? error.message : status;
  }
}

function acquireWriterLock(): void {
  if (!("locks" in navigator)) {
    writerMode = "unavailable";
    return;
  }
  const hold = new Promise<void>((resolve) => {
    releaseWriterLock = resolve;
  });
  void navigator.locks.request(
    "uft-workspace-write",
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        writerMode = "read-only";
        status = "別の UFT タブが書き込み中です（読み取り専用）";
        return;
      }
      writerMode = "writer";
      await hold;
    },
  );
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
    workspace = await repository.open(selected);
    activeEntryId = workspace.lastOpenedEntryId ?? activeEntries(workspace).find((entry) => entry.kind === "markdown")?.id ?? null;
    expanded = new Set(activeEntries(workspace).filter((entry) => entry.kind === "folder").map((entry) => entry.id));
    await hydrateAssets();
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
  if (workspace) workspace.lastOpenedEntryId = entry.id;
  scheduleSave();
}

function create(kind: EntryKind): void {
  if (!workspace) return;
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
  if (!workspace || !activeEntry) return;
  const name = window.prompt("新しい名前", activeEntry.name);
  if (!name) return;
  try {
    renameEntry(workspace, activeEntry.id, name);
    scheduleSave();
  } catch (error) {
    notify(error);
  }
}

function move(): void {
  if (!workspace || !activeEntry) return;
  const candidates = activeEntries(workspace)
    .filter((entry) => entry.kind === "folder" && entry.id !== activeEntry.id)
    .map((entry) => `${entry.path} (${entry.id})`)
    .join("\n");
  const id = window.prompt(
    `移動先フォルダの ID を入力してください（空欄はルート）\n${candidates}`,
    activeEntry.parentId ?? "",
  );
  if (id === null) return;
  try {
    moveEntry(workspace, activeEntry.id, id.trim() || null);
    scheduleSave();
  } catch (error) {
    notify(error);
  }
}

function editDocument(content: string): void {
  if (!workspace || !activeEntry || activeEntry.kind !== "markdown") return;
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
  if (writerMode === "read-only") {
    notify(new Error("別のタブが書き込み中です。そちらを閉じてから保存してください。"));
    return false;
  }
  if (saveTimer) clearTimeout(saveTimer);
  try {
    status = "保存中…";
    await repository.save(workspace);
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

async function addImage(file: File): Promise<void> {
  if (
    !workspace ||
    !repository ||
    !activeEntry ||
    activeEntry.kind !== "markdown"
  )
    return;
  if (
    !/^image\/(png|jpeg|gif|webp)$/.test(file.type) ||
    file.size > 20 * 1024 * 1024
  ) {
    notify(
      new Error(
        "PNG / JPEG / GIF / WebP の 20 MB 以下の画像を選択してください。",
      ),
    );
    return;
  }
  const base = file.name.replace(/[^\w.()-]/g, "-");
  let path = `assets/${base}`;
  let index = 2;
  while (workspace.assets.some((asset) => asset.path === path))
    path = `assets/${base.replace(/(\.[^.]+)?$/, `-${index++}$1`)}`;
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const asset: Asset = {
    id: newId("asset"),
    workspaceId: workspace.id,
    path,
    mediaType: file.type,
    byteSize: file.size,
    checksum: [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
    createdAt: new Date().toISOString(),
  };
  await repository.putAsset(asset, bytes);
  workspace.assets.push(asset);
  assetUrls = { ...assetUrls, [path]: URL.createObjectURL(file) };
  insertIntoEditor(
    `![${file.name}](${relativeAssetPath(activeEntry.path, path)})`,
  );
  scheduleSave();
}

async function saveDiagram(diagram: import("./lib/domain/workspace").DiagramDocument): Promise<void> {
  if (!workspace || !repository || !activeEntry || activeEntry.kind !== "diagram") return;
  const svg = graphToSvg(diagram.graph);
  const bytes = new TextEncoder().encode(svg).buffer;
  const path = `assets/diagrams/${activeEntry.name.replace(/\.[^.]+$/, "")}.svg`;
  let asset = workspace.assets.find((candidate) => candidate.path === path);
  if (!asset) {
    asset = { id: newId("asset"), workspaceId: workspace.id, path, mediaType: "image/svg+xml", byteSize: bytes.byteLength, checksum: "generated", createdAt: new Date().toISOString() };
    workspace.assets.push(asset);
  }
  asset.byteSize = bytes.byteLength;
  await repository.putAsset(asset, bytes);
  assetUrls = { ...assetUrls, [path]: URL.createObjectURL(new Blob([bytes], { type: asset.mediaType })) };
  const result = graphToMermaid(diagram.graph);
  workspace.diagrams[activeEntry.id] = { ...diagram, previewAssetId: asset.id, mermaidSource: result.source ?? null, updatedAt: new Date().toISOString() };
  scheduleSave();
}

function insertDiagramReference(): void {
  if (!workspace || !activeEntry || activeEntry.kind !== "diagram") return;
  const path = `assets/diagrams/${activeEntry.name.replace(/\.[^.]+$/, "")}.svg`;
  const document = activeEntries(workspace).find((entry) => entry.kind === "markdown");
  if (!document) return;
  activeEntryId = document.id;
  window.setTimeout(() => insertIntoEditor(`![${activeEntry.name}](${relativeAssetPath(document.path, path)})`), 0);
}

async function backup(): Promise<void> {
  if (!workspace || !repository) return;
  await saveNow();
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
  if (!repository) return;
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
    await saveNow();
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
  download(
    new Blob([activeDocument.content], { type: "text/markdown;charset=utf-8" }),
    activeEntry.name,
  );
}
function printDocument(): void {
  mode = "preview";
  window.setTimeout(() => window.print(), 150);
}
function remove(): void {
  if (!workspace || !deleteTarget) return;
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
  if (!workspace || !deletedIds.length) return;
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
  if (!workspace || !files?.length || importingDocuments) return;
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

<svelte:head><title>UFT — Markdown workspace</title><meta name="description" content="A local-first workspace for Markdown design documents." /><meta name="theme-color" content="#2d4932" /><link rel="manifest" href="/manifest.webmanifest" /></svelte:head>

{#if isLauncher}
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
            <span class="tool-icon">{tool.icon}</span>
            <span class="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
            <span class="tool-arrow">→</span>
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
        <a class="top-link" href="/">ホーム</a><button onclick={navigateToDocumentImport}>文書を変換</button><button onclick={() => paletteOpen = true}>コマンド <kbd>⌘ ⇧ K</kbd></button><button onclick={backup}>ZIP バックアップ</button><button class="save-button" onclick={saveNow}>保存 <kbd>⌘ S</kbd></button>
      {/if}
    </div>
  </header>
  {#if isDocumentImport}
    <section class="document-import-shell" aria-labelledby="document-import-title">
      <div class="document-import-card">
        <p class="eyebrow">LOCAL CONVERSION</p>
        <h1 id="document-import-title">文書を Markdown に変換</h1>
        <p>選択したファイルはこのブラウザ内の Worker だけで処理されます。元ファイルは保存せず、編集可能な Markdown を <code>imports/</code> に追加します。</p>
        <button class="import-picker" onclick={() => documentImportInput?.click()} disabled={importingDocuments || !workspace || writerMode === "read-only"}>複数の文書を選択</button>
        <p class="import-hint">Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、テキスト PDF に対応。1 ファイル 50 MB、合計 200 MB まで。</p>
        {#if writerMode === "read-only"}
          <p class="import-lock-warning" role="status">別の UFT タブが書き込み中です。保存するには、そちらのタブを閉じてからこの画面を再読み込みしてください。</p>
        {/if}
        {#if importingDocuments}
          <div class="import-progress" role="status">
            <div><strong>{documentImportProgress.completed} / {documentImportProgress.total}</strong> 件を処理中{#if documentImportProgress.currentName}：{documentImportProgress.currentName}{/if}</div>
            <progress value={documentImportProgress.completed} max={documentImportProgress.total}></progress>
            <button onclick={cancelDocumentImport}>キャンセル</button>
          </div>
        {/if}
        {#if documentImportResults.length}
          <section class="import-results" aria-live="polite">
            <h2>{documentImportResults.filter((result) => result.status === "imported").length} 件を追加しました</h2>
            <ul>
              {#each documentImportResults as result, index (index)}
                <li class:failed={result.status === "failed"} class:cancelled={result.status === "cancelled"}>
                  <span>{result.status === "imported" ? "✓" : result.status === "cancelled" ? "–" : "!"}</span>
                  <div><strong>{result.file.name}</strong><small>{result.status === "imported" ? `${result.entry?.path} として追加しました` : result.reason}</small></div>
                </li>
              {/each}
            </ul>
            {#if completedImportEntry}
              <button class="open-imported-document" onclick={openImportedDocument}>変換した文書を開く</button>
            {/if}
          </section>
        {/if}
      </div>
    </section>
  {:else}
  <section class="workspace">
    <aside class="sidebar" aria-label="Explorer">
      <div class="sidebar-title"><span>EXPLORER</span><span><button aria-label="新しい文書" onclick={() => create("markdown")}>＋</button><button aria-label="新しいフォルダ" onclick={() => create("folder")}>□</button></span></div>
      {#if workspace}
        {#each visibleEntries as { entry, depth } (entry.id)}
          <button class:active={entry.id === activeEntryId} class="tree-item" style={`padding-left:${9 + depth * 16}px`} onclick={() => selectEntry(entry)}>{entry.kind === "folder" ? (expanded.has(entry.id) ? "⌄" : "›") : entry.kind === "diagram" ? "◇" : "▤"} <span>{entry.name}</span></button>
        {/each}
      {:else}<p class="loading-tree">読み込み中…</p>{/if}
      <div class="sidebar-actions"><button onclick={rename} disabled={!activeEntry}>名前変更</button><button onclick={move} disabled={!activeEntry}>移動</button><button onclick={() => deleteTarget = activeEntry} disabled={!activeEntry}>削除</button></div>
    </aside>
    <section class="main-pane">
      <div class="editor-toolbar"><div class="mode-switch"><button class:selected={mode === "source"} onclick={() => mode = "source"}>Source</button><button class:selected={mode === "split"} onclick={() => mode = "split"}>Split</button><button class:selected={mode === "preview"} onclick={() => mode = "preview"}>Preview</button><button class:selected={mode === "diff"} onclick={openDiff}>Diff</button></div>{#if mode === "diff" && comparisonEntries.length}<div class="diff-selector"><span>比較元</span><button bind:this={comparisonPickerButton} type="button" class="diff-selector-trigger" aria-label={`比較元: ${compareEntry?.path ?? "未選択"}`} aria-haspopup="listbox" aria-expanded={comparisonPickerOpen} onclick={toggleComparisonPicker}>{compareEntry?.path ?? "文書を選択"}<span aria-hidden="true">⌄</span></button>{#if comparisonPickerOpen}<div class="diff-picker-popover"><input bind:this={comparisonSearchInput} bind:value={comparisonQuery} aria-label="比較元を検索" aria-controls="comparison-picker-results" aria-activedescendant={matchingComparisonEntries[comparisonActiveIndex] ? `comparison-option-${matchingComparisonEntries[comparisonActiveIndex].id}` : undefined} placeholder="文書を検索…" autocomplete="off" oninput={() => comparisonActiveIndex = 0} onkeydown={handleComparisonSearchKeydown} /><div id="comparison-picker-results" class="diff-picker-results" role="listbox" aria-label="比較元の候補">{#each matchingComparisonEntries as entry, index (entry.id)}<button id={`comparison-option-${entry.id}`} type="button" role="option" class:active={index === comparisonActiveIndex} aria-selected={entry.id === compareEntryId} onmouseenter={() => comparisonActiveIndex = index} onclick={() => chooseComparisonEntry(entry.id)}>{entry.path}</button>{:else}<p>一致する Markdown 文書はありません。</p>{/each}</div></div>{/if}</div>{/if}<span class:error-text={statusTone === "error"} class="status"><span class="local-dot"></span>{status}</span></div>
      {#if activeEntry?.kind === "markdown" && activeDocument}
        {#if mode === "diff"}
          <section class="diff-pane" aria-label="Markdown comparison">
            {#if compareEntry && compareDocument}
              <header class="diff-heading"><span>{compareEntry.path}</span><span aria-hidden="true">→</span><strong>{activeEntry.path}</strong></header>
              <MarkdownDiff before={compareDocument.content} after={activeDocument.content} />
            {:else}
              <p class="diff-empty">比較する Markdown 文書を選択してください。</p>
            {/if}
          </section>
        {:else}
          <div class:source-only={mode === "source"} class:preview-only={mode === "preview"} class="document-area">
            {#if mode !== "preview"}<section class="source-pane">{#key activeEntry.id}<CodeMirrorEditor value={activeDocument.content} onChange={editDocument} onReady={(fn) => insertIntoEditor = fn} />{/key}</section>{/if}
            {#if mode !== "source"}<section class="preview-pane"><MarkdownPreview markdown={activeDocument.content} {assetUrls} documentPath={activeEntry.path} /></section>{/if}
          </div>
        {/if}
      {:else if activeEntry?.kind === "diagram" && activeDiagram}
        <section class="diagram-workspace"><div class="diagram-heading"><div><p class="eyebrow">DIAGRAM</p><h1>{activeEntry.name}</h1></div><button onclick={insertDiagramReference}>Markdown に SVG を挿入</button></div>{#if DiagramEditor}<DiagramEditor diagram={activeDiagram} onChange={saveDiagram} />{:else}<p>図表エディタを読み込んでいます…</p>{/if}</section>
      {:else}<section class="setup-card"><p class="eyebrow">LOCAL-FIRST</p><h1>文書を選択、または新規作成してください。</h1><p>データはこのブラウザ内に保存されます。定期的に ZIP バックアップを作成してください。</p></section>{/if}
    </section>
  </section>
  <footer class="footer"><span>Markdown · Local-first · Offline</span><span>{activeDocument?.content.trim().split(/\s+/).filter(Boolean).length ?? 0} words · UTF-8</span></footer>
  {/if}
</main>

<input bind:this={documentImportInput} hidden type="file" multiple accept={documentAccept} onchange={(event) => void importSelectedDocuments(event.currentTarget.files)} />
<input bind:this={imageInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void addImage(file); event.currentTarget.value = ""; }} />
<input bind:this={importInput} hidden type="file" accept="application/zip,.zip" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void restore(file); }} />
{#if paletteOpen}<div class="palette-scrim"><dialog open class="palette" aria-label="Command palette"><input bind:value={query} placeholder="コマンドを検索…" />{#each commands as commandItem}{#if !query || commandItem.name.includes(query)}<button onclick={() => command(commandItem.action)}>{commandItem.name}</button>{/if}{/each}</dialog></div>{/if}
<ConfirmDialog open={Boolean(deleteTarget)} title="項目を削除しますか？" detail={deleteTarget ? `「${deleteTarget.path}」とその子項目をこのセッションから削除します。` : ""} onCancel={() => deleteTarget = null} onConfirm={remove} />
{#if toast}<button class="undo-toast" onclick={undoDelete}>{toast}</button>{/if}<Toast message="" />
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
            <span class="tool-icon">{tool.icon}</span>
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
