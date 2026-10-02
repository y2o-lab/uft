<script lang="ts">
import { onMount } from "svelte";
import MarkdownDiff from "./MarkdownDiff.svelte";
import type { WorkspaceCommandContext } from "../workspace/workspace-commands";
import { createWorkspaceCommands } from "../workspace/workspace-commands";
import { createMarkdownTools } from "../webmcp/markdown-tools";
import { getModelContext, registerTools } from "../webmcp/register-tools";

let { workspaceId, context }: { workspaceId: string | undefined; context: Omit<WorkspaceCommandContext, "isEnabled" | "confirm"> } = $props();
let enabledId = $state<string | null>(null);
let enabled = $derived(Boolean(workspaceId && workspaceId === enabledId));
let registration = $state("無効");
const modelContext = getModelContext();
let confirmation = $state<{ before: string; after: string; finish: (approved: boolean) => void } | null>(null);
const commands = createWorkspaceCommands({
  getWorkspace: () => context.getWorkspace(),
  getRepository: () => context.getRepository(),
  getSelection: () => context.getSelection(),
  applySaved: (saved, selected) => context.applySaved(saved, selected),
  guard: (id, busy) => context.guard(id, busy),
  enqueue: operation => context.enqueue(operation),
  isEnabled: () => enabled,
  confirm: (before, after, signal) => new Promise<boolean>(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const finish = (approved: boolean) => {
      signal.removeEventListener("abort", cancel);
      confirmation = null;
      resolve(approved);
    };
    const cancel = () => finish(false);
    signal.addEventListener("abort", cancel, { once: true });
    confirmation = { before, after, finish };
  }),
});
$effect(() => {
  const id = workspaceId;
  if (!enabled || !id || !modelContext) { registration = "無効"; return; }
  const lifetime = new AbortController();
  registration = "登録中…";
  const dispose = registerTools(modelContext, createMarkdownTools(id, commands, lifetime.signal), state => {
    if (state === "failed") lifetime.abort();
    registration = state === "ready" ? "5 ツール利用可能" : "登録失敗。通常編集を利用できます。";
  });
  return () => { lifetime.abort(); dispose(); enabledId = null; };
});
onMount(() => {
  const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") confirmation?.finish(false); };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
});
</script>

<details class="ai-integration">
  <summary>AI 連携</summary>
  <p>有効にすると、このワークスペースの文書を対応 AI が読み取り・編集できます。読み取った本文は AI サービスで処理される場合があります。</p>
  <label><input type="checkbox" checked={enabled} disabled={!workspaceId || !modelContext} onchange={event => enabledId = event.currentTarget.checked ? workspaceId ?? null : null} />AI 連携を有効にする</label>
  <p role="status">{modelContext ? registration : "このブラウザは WebMCP 未対応です。通常編集を利用できます。"}</p>
  <p>設定はこのページだけで有効です。別タブで保存された変更との競合を検出します。別タブの未保存入力は保護できません。</p>
</details>
{#if confirmation}
  <dialog open class="ai-confirmation" aria-label="AI による本文更新の確認" aria-describedby="ai-confirm-detail">
    <h2>AI による本文更新</h2>
    <p id="ai-confirm-detail">差分を確認して適用してください。確認中に本文を編集した場合は、更新を拒否します。</p>
    <div class="ai-diff"><MarkdownDiff before={confirmation.before} after={confirmation.after} /></div>
    <div class="ai-confirm-actions"><button onclick={() => confirmation?.finish(false)}>キャンセル</button><button onclick={() => confirmation?.finish(true)}>変更を適用</button></div>
  </dialog>
{/if}
<style>
.ai-integration { padding: 10px; border-top: 1px solid #cbd5cb; font-size: 12px; }
.ai-integration summary { cursor: pointer; font-weight: 600; }
.ai-integration p { line-height: 1.5; }
.ai-integration label { display: flex; align-items: center; gap: 6px; }
.ai-confirmation { position: fixed; z-index: 40; margin: 0; left: auto; top: auto; right: 16px; bottom: 32px; width: min(540px, calc(100vw - 32px)); padding: 16px; background: #fff; color: #223428; border: 1px solid #94a394; border-radius: 12px; box-shadow: 0 8px 40px #0003; }
.ai-confirmation h2 { font-size: 18px; margin: 0; }
.ai-confirmation p { font-size: 13px; }
.ai-diff { max-height: 35vh; overflow: auto; }
.ai-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; }
</style>
