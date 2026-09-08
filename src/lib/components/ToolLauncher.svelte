<script lang="ts">
  import { ArrowRight, FileInput, FileText, Globe2 } from "@lucide/svelte";

  type Tool = { id: string; href: string; icon: typeof FileText; name: string; description: string };
  type Props = { open?: boolean };
  let { open = $bindable(false) }: Props = $props();
  let query = $state("");
  let input = $state<HTMLInputElement>();
  let selectedIndex = $state(0);
  const tools: Tool[] = [
    { id: "markdown-workspace", href: "/workspace", icon: FileText, name: "Markdown ワークスペース", description: "文書の作成、編集、プレビュー、ZIP バックアップ" },
    { id: "document-import", href: "/convert-to-markdown", icon: FileInput, name: "文書を Markdown に変換", description: "ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加" },
    { id: "ip-toolkit", href: "/ip-toolkit", icon: Globe2, name: "IP Toolkit", description: "IP 判定、CIDR 計算、IPv4 / IPv6 変換、ログ抽出と Lookup" },
  ];
  const matching = $derived(tools.filter((tool) => {
    const normalized = query.trim().toLocaleLowerCase();
    return !normalized || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalized);
  }));

  export function focusSearch(): void { window.setTimeout(() => input?.focus(), 0); }
  export function openLauncher(): void { query = ""; selectedIndex = 0; open = true; focusSearch(); }
  export function closeLauncher(): void { open = false; query = ""; }
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") return closeLauncher();
    if (event.key === "ArrowDown" && matching.length) { event.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, matching.length - 1); return; }
    if (event.key === "ArrowUp" && matching.length) { event.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); return; }
    if (event.key === "Enter" && matching.length) { event.preventDefault(); window.location.assign((matching[selectedIndex] ?? matching[0]).href); }
  }
</script>

{#if open}
  <div class="tool-launcher-scrim"><button type="button" class="modal-backdrop" aria-label="ツールランチャーを閉じる" onclick={closeLauncher}></button><dialog open class="tool-launcher-dialog" aria-label="ツールランチャー"><label class="tool-launcher-search"><span>ツールを検索 <kbd>Esc</kbd></span><input bind:this={input} bind:value={query} oninput={() => selectedIndex = 0} onkeydown={handleKeydown} placeholder="ツール名や機能で検索…" autocomplete="off" /></label><div class="tool-launcher-results">{#each matching as tool, index (tool.id)}<a class:selected={selectedIndex === index} class="tool-launcher-result" href={tool.href} onmouseenter={() => selectedIndex = index}><span class="tool-icon"><tool.icon aria-hidden="true" /></span><span class="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span><kbd>↵</kbd></a>{:else}<p class="tool-launcher-empty">一致するツールはありません。</p>{/each}</div><footer><span>↑↓ 選択</span><span>↵ 開く</span><span>Esc 閉じる</span></footer></dialog></div>
{/if}
