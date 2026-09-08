<script lang="ts">
  import { ArrowRight, CircleAlert, CircleCheck, Files, Minus, X } from "@lucide/svelte";
  import { onDestroy } from "svelte";
  import type { Workspace, WorkspaceEntry } from "../domain/workspace";
  import { AnyDocClient } from "../import/anydoc-client";
  import {
    documentAccept,
    type ImportProgress,
    type ImportResult,
    importDocuments,
  } from "../import/document-import";

  type Props = {
    workspace: Workspace | null;
    canWrite: boolean;
    saveNow: () => Promise<boolean>;
    onStatus: (message: string) => void;
    onOpenDocument: (entry: WorkspaceEntry) => void;
    onError: (error: unknown) => void;
  };

  let { workspace, canWrite, saveNow, onStatus, onOpenDocument, onError }: Props = $props();
  let input = $state<HTMLInputElement>();
  let client: AnyDocClient | undefined;
  let controller: AbortController | undefined;
  let results = $state<ImportResult[]>([]);
  let progress = $state<ImportProgress>({ completed: 0, total: 0 });
  let importing = $state(false);
  let completedEntry = $state<WorkspaceEntry | null>(null);

  function cancel(): void {
    controller?.abort();
  }

  async function importSelected(files: FileList | null): Promise<void> {
    if (!workspace || !files?.length || importing || !canWrite) return;
    importing = true;
    results = [];
    completedEntry = null;
    progress = { completed: 0, total: files.length };
    controller = new AbortController();
    client ??= new AnyDocClient();
    try {
      const importedResults = await importDocuments({
        workspace,
        files: Array.from(files),
        signal: controller.signal,
        convert: (file, format, signal) =>
          client?.convert(file, format, signal) ??
          Promise.reject(new Error("変換機能を開始できませんでした。")),
        onProgress: (next) => (progress = next),
      });
      results = importedResults;
      const imported = importedResults.filter((result) => result.status === "imported");
      if (!imported.length || !(await saveNow())) return;
      const firstEntry = imported[0]?.entry;
      onStatus(`${imported.length} 件の文書を imports/ に追加しました`);
      completedEntry = firstEntry ?? null;
      if (firstEntry && importedResults.every((result) => result.status === "imported"))
        window.setTimeout(() => {
          if (completedEntry?.id === firstEntry.id && !importing)
            onOpenDocument(firstEntry);
        }, 1_200);
    } catch (error) {
      onError(error);
    } finally {
      importing = false;
      controller = undefined;
      if (input) input.value = "";
    }
  }

  function openCompletedDocument(): void {
    if (completedEntry) onOpenDocument(completedEntry);
  }

  onDestroy(() => {
    client?.dispose();
    controller?.abort();
  });
</script>

<section class="document-import-shell" aria-labelledby="document-import-title">
  <div class="document-import-card">
    <p class="eyebrow">LOCAL CONVERSION</p>
    <h1 id="document-import-title">文書を Markdown に変換</h1>
    <p>選択したファイルはこのブラウザ内の Worker だけで処理されます。元ファイルは保存せず、編集可能な Markdown を <code>imports/</code> に追加します。</p>
    <button class="import-picker button-with-icon" onclick={() => input?.click()} disabled={importing || !workspace}><Files aria-hidden="true" />複数の文書を選択</button>
    <p class="import-hint">Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、テキスト PDF に対応。1 ファイル 50 MB、合計 200 MB まで。</p>
    {#if importing}
      <div class="import-progress" role="status"><div><strong>{progress.completed} / {progress.total}</strong> 件を処理中{#if progress.currentName}：{progress.currentName}{/if}</div><progress value={progress.completed} max={progress.total}></progress><button class="button-with-icon" onclick={cancel}><X aria-hidden="true" />キャンセル</button></div>
    {/if}
    {#if results.length}
      <section class="import-results" aria-live="polite"><h2>{results.filter((result) => result.status === "imported").length} 件を追加しました</h2><ul>{#each results as result, index (index)}<li class:failed={result.status === "failed"} class:cancelled={result.status === "cancelled"}><span class="import-result-icon" aria-hidden="true">{#if result.status === "imported"}<CircleCheck />{:else if result.status === "cancelled"}<Minus />{:else}<CircleAlert />{/if}</span><div><strong>{result.file.name}</strong><small>{result.status === "imported" ? `${result.entry?.path} として追加しました` : result.reason}</small></div></li>{/each}</ul>{#if completedEntry}<button class="open-imported-document button-with-icon" onclick={openCompletedDocument}>変換した文書を開く<ArrowRight aria-hidden="true" /></button>{/if}</section>
    {/if}
  </div>
</section>

<input bind:this={input} hidden type="file" multiple accept={documentAccept} onchange={(event) => void importSelected(event.currentTarget.files)} />
