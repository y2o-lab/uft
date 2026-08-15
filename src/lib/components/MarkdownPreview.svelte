<script lang="ts">
  import { tick } from "svelte";
  import { renderMermaid } from "../markdown/mermaid";
  import { renderMarkdown } from "../markdown/preview";
  let { markdown = "", assetUrls = {}, documentPath = "docs/overview.md" }: { markdown?: string; assetUrls?: Record<string, string>; documentPath?: string } = $props();
  let html = $state(""); let host: HTMLElement; let renderVersion = 0;
  $effect(() => { void updateHtml(markdown, assetUrls, documentPath); });
  async function updateHtml(source: string, urls: Record<string, string>, path: string): Promise<void> { const version = ++renderVersion; const rendered = await renderMarkdown(source); if (version !== renderVersion) return; html = rendered.replace(/src="([^"]+)"/g, (match, sourcePath) => { const url = urls[resolveAssetPath(path, sourcePath)]; return url ? `src="${url}"` : match; }); await tick(); if (version === renderVersion) void renderDiagrams(); }
  function resolveAssetPath(currentPath: string, reference: string): string { if (/^[a-z]+:|^#|^\//i.test(reference)) return reference; const parts = currentPath.split("/").slice(0, -1); for (const part of reference.split("/")) { if (!part || part === ".") continue; if (part === "..") parts.pop(); else parts.push(part); } return parts.join("/"); }
  async function renderDiagrams(): Promise<void> { if (!host) return; for (const block of host.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) { const pre = block.parentElement; if (!pre || pre.dataset.rendered === block.textContent) continue; pre.dataset.rendered = block.textContent ?? ""; try { const svg = await renderMermaid(block.textContent ?? ""); pre.outerHTML = `<figure class="mermaid-diagram" role="img" aria-label="Mermaid diagram">${svg}</figure>`; } catch (error) { const message = error instanceof Error ? error.message : "Mermaid 図を描画できません。"; pre.insertAdjacentHTML("afterend", `<p class="diagram-error" role="alert">Mermaid エラー: ${message.replace(/[<&>]/g, "")}</p>`); } } }
</script>
<article class="preview-content" bind:this={host}>{@html html}</article>
