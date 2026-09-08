<script lang="ts">
  import { ArrowRight, FileInput, FileText, Globe2 } from "@lucide/svelte";
  import { onMount } from "svelte";

  type Tool = { id: string; href: string; icon: typeof FileText; name: string; description: string };
  let query = $state("");
  let selectedIndex = $state(0);
  let input = $state<HTMLInputElement>();
  const tools: Tool[] = [
    { id: "markdown-workspace", href: "/workspace", icon: FileText, name: "Markdown ワークスペース", description: "文書の作成、編集、プレビュー、ZIP バックアップ" },
    { id: "document-import", href: "/convert-to-markdown", icon: FileInput, name: "文書を Markdown に変換", description: "ローカルの Word、PDF、表計算ファイルなどを imports/ へ追加" },
    { id: "ip-toolkit", href: "/ip-toolkit", icon: Globe2, name: "IP Toolkit", description: "IP 判定、CIDR 計算、IPv4 / IPv6 変換、ログ抽出と Lookup" },
  ];
  const matching = $derived(tools.filter((tool) => {
    const normalized = query.trim().toLocaleLowerCase();
    return !normalized || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalized);
  }));
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" && matching.length) { event.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, matching.length - 1); }
    else if (event.key === "ArrowUp" && matching.length) { event.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); }
    else if (event.key === "Enter" && matching.length) { event.preventDefault(); window.location.assign((matching[selectedIndex] ?? matching[0]).href); }
  }
  onMount(() => {
    const focusWithShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input?.focus();
      }
    };
    window.addEventListener("keydown", focusWithShortcut);
    return () => window.removeEventListener("keydown", focusWithShortcut);
  });
</script>

<main class="launcher-page"><header class="launcher-topbar"><a class="brand" href="/" aria-label="UFT ホーム"><span class="brand-mark">u</span><span>uft</span></a><span>LOCAL-FIRST TOOLKIT</span></header><section class="launcher-content" aria-labelledby="launcher-title"><p class="eyebrow">WORKSPACE LAUNCHER</p><h1 id="launcher-title">作業を始めるツールを選択</h1><p class="launcher-lead">UFT のツールはすべてこのブラウザ内で動作します。ここへ新しいツールを追加していけます。</p><label class="launcher-search"><span>ツールを検索 <kbd>⌘ K</kbd></span><input bind:this={input} bind:value={query} oninput={() => selectedIndex = 0} onkeydown={handleKeydown} placeholder="ツール名や機能で検索…" autocomplete="off" /></label><div class="tool-launcher-grid">{#each matching as tool (tool.id)}<a class="tool-launcher-card" href={tool.href}><span class="tool-icon"><tool.icon aria-hidden="true" /></span><span class="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span><ArrowRight class="tool-arrow" aria-hidden="true" /></a>{:else}<p class="launcher-empty">一致するツールはありません。別のキーワードで検索してください。</p>{/each}</div><p class="launcher-footnote">新しいツールはこのランチャーから追加・起動できる設計です。</p></section></main>
