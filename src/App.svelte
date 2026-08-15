<script lang="ts">
import { onMount } from "svelte";
import CodeMirrorEditor from "./lib/components/CodeMirrorEditor.svelte";
import ConfirmDialog from "./lib/components/ConfirmDialog.svelte";
import MarkdownPreview from "./lib/components/MarkdownPreview.svelte";
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
import type { Component } from "svelte";

type Mode = "source" | "split" | "preview";
let workspace = $state<Workspace | null>(null);
let repository = $state<WorkspaceRepository | null>(null);
let activeEntryId = $state<string | null>(null);
let mode = $state<Mode>("split");
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
let importInput: HTMLInputElement;
let imageInput: HTMLInputElement;
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
let visibleEntries = $derived(workspace ? flattenEntries(workspace) : []);
let documentTitle = $derived(activeEntry?.path ?? "ワークスペース");
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
  { name: "画像を挿入", action: () => imageInput.click() },
  { name: "ZIP を復元", action: () => importInput.click() },
  { name: "開いている Markdown をダウンロード", action: downloadMarkdown },
  { name: "プレビューを印刷 / PDF 保存", action: printDocument },
];

onMount(() => {
  const boot = window.setTimeout(() => void initialize(), 0);
  const onKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      paletteOpen = true;
    }
    if (event.key === "Escape") {
      paletteOpen = false;
      deleteTarget = null;
    }
  };
  window.addEventListener("keydown", onKey);
  return () => {
    clearTimeout(boot);
    window.removeEventListener("keydown", onKey);
    Object.values(assetUrls).forEach(URL.revokeObjectURL);
    releaseWriterLock?.();
  };
});

$effect(() => {
  if (activeEntry?.kind !== "diagram" || DiagramEditor) return;
  void import("./lib/components/DiagramEditor.svelte").then((module) => {
    DiagramEditor = module.default;
  });
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
    activeEntryId =
      workspace.lastOpenedEntryId ??
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
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  status = "保存待ち";
  saveTimer = setTimeout(() => void saveNow(), 500);
}
async function saveNow(): Promise<void> {
  if (!workspace || !repository) return;
  if (writerMode === "read-only") {
    notify(new Error("別のタブが書き込み中です。そちらを閉じてから保存してください。"));
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  try {
    status = "保存中…";
    await repository.save(workspace);
    status = "保存済み";
    statusTone = "info";
  } catch (error) {
    status = "保存に失敗しました";
    statusTone = "error";
    notify(error);
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
    importInput.value = "";
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
</script>

<svelte:head><title>UFT — Markdown workspace</title><meta name="description" content="A local-first workspace for Markdown design documents." /><meta name="theme-color" content="#2d4932" /><link rel="manifest" href="/manifest.webmanifest" /></svelte:head>

<main class="app-shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark">u</span><span>uft</span></div>
    <div class="document-chip">{documentTitle}</div>
    <div class="top-actions"><button onclick={() => paletteOpen = true}>コマンド <kbd>⌘ K</kbd></button><button onclick={backup}>ZIP バックアップ</button><button class="save-button" onclick={saveNow}>保存 <kbd>⌘ S</kbd></button></div>
  </header>
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
      <div class="editor-toolbar"><div class="mode-switch"><button class:selected={mode === "source"} onclick={() => mode = "source"}>Source</button><button class:selected={mode === "split"} onclick={() => mode = "split"}>Split</button><button class:selected={mode === "preview"} onclick={() => mode = "preview"}>Preview</button></div><span class:error-text={statusTone === "error"} class="status"><span class="local-dot"></span>{status}</span></div>
      {#if activeEntry?.kind === "markdown" && activeDocument}
        <div class:source-only={mode === "source"} class:preview-only={mode === "preview"} class="document-area">
          {#if mode !== "preview"}<section class="source-pane"><CodeMirrorEditor value={activeDocument.content} onChange={editDocument} onReady={(fn) => insertIntoEditor = fn} /></section>{/if}
          {#if mode !== "source"}<section class="preview-pane"><MarkdownPreview markdown={activeDocument.content} {assetUrls} documentPath={activeEntry.path} /></section>{/if}
        </div>
      {:else if activeEntry?.kind === "diagram" && activeDiagram}
        <section class="diagram-workspace"><div class="diagram-heading"><div><p class="eyebrow">DIAGRAM</p><h1>{activeEntry.name}</h1></div><button onclick={insertDiagramReference}>Markdown に SVG を挿入</button></div>{#if DiagramEditor}<DiagramEditor diagram={activeDiagram} onChange={saveDiagram} />{:else}<p>図表エディタを読み込んでいます…</p>{/if}</section>
      {:else}<section class="setup-card"><p class="eyebrow">LOCAL-FIRST</p><h1>文書を選択、または新規作成してください。</h1><p>データはこのブラウザ内に保存されます。定期的に ZIP バックアップを作成してください。</p></section>{/if}
    </section>
  </section>
  <footer class="footer"><span>Markdown · Local-first · Offline</span><span>{activeDocument?.content.trim().split(/\s+/).filter(Boolean).length ?? 0} words · UTF-8</span></footer>
</main>

<input bind:this={imageInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void addImage(file); event.currentTarget.value = ""; }} />
<input bind:this={importInput} hidden type="file" accept="application/zip,.zip" onchange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void restore(file); }} />
{#if paletteOpen}<div class="palette-scrim"><dialog open class="palette" aria-label="Command palette"><input bind:value={query} placeholder="コマンドを検索…" />{#each commands as commandItem}{#if !query || commandItem.name.includes(query)}<button onclick={() => command(commandItem.action)}>{commandItem.name}</button>{/if}{/each}</dialog></div>{/if}
<ConfirmDialog open={Boolean(deleteTarget)} title="項目を削除しますか？" detail={deleteTarget ? `「${deleteTarget.path}」とその子項目をこのセッションから削除します。` : ""} onCancel={() => deleteTarget = null} onConfirm={remove} />
{#if toast}<button class="undo-toast" onclick={undoDelete}>{toast}</button>{/if}<Toast message="" />
