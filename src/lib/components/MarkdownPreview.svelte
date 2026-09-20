<script lang="ts">
  import { onMount, tick } from "svelte";
  import MarkdownFormattingToolbar from "./MarkdownFormattingToolbar.svelte";
  import { renderMermaid } from "../markdown/mermaid";
  import { previewToMarkdown } from "../markdown/preview-to-markdown";
  import { renderMarkdown } from "../markdown/preview";
  import type { MarkdownFormat } from "../markdown/formatting";
  let { markdown = "", assetUrls = {}, documentPath = "docs/overview.md", canEdit = false, onChange = () => undefined }: { markdown?: string; assetUrls?: Record<string, string>; documentPath?: string; canEdit?: boolean; onChange?: (markdown: string) => void } = $props();
  let html = $state(""); let host: HTMLElement; let renderVersion = 0; let editing = $state(false); let lastEmittedMarkdown: string | null = null; let activeFormats = $state(new Set<MarkdownFormat>()); let savedRange: Range | null = null;
  $effect(() => { if (editing && markdown === lastEmittedMarkdown) return; void updateHtml(markdown, assetUrls, documentPath); });
  $effect(() => { if (!canEdit && editing) editing = false; });
  onMount(() => {
    const onSelectionChange = () => { if (editing) refreshActiveFormats(); };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  });
  async function updateHtml(source: string, urls: Record<string, string>, path: string): Promise<void> { const version = ++renderVersion; const rendered = await renderMarkdown(source); if (version !== renderVersion) return; html = rendered; await tick(); if (version !== renderVersion) return; hydrateAssetImages(urls, path); void renderDiagrams(version); }
  function resolveAssetPath(currentPath: string, reference: string): string { if (/^[a-z]+:|^#|^\//i.test(reference)) return reference; const parts = currentPath.split("/").slice(0, -1); for (const part of reference.split("/")) { if (!part || part === ".") continue; if (part === "..") parts.pop(); else parts.push(part); } const path = parts.join("/"); try { return decodeURIComponent(path); } catch { return path; } }
  function hydrateAssetImages(urls: Record<string, string>, path: string): void { if (!host) return; for (const image of host.querySelectorAll<HTMLImageElement>("img[src]")) { const source = image.getAttribute("src") ?? ""; image.dataset.markdownSrc = source; const url = urls[resolveAssetPath(path, source)]; if (url) image.src = url; } }
  async function renderDiagrams(version: number): Promise<void> { if (!host) return; for (const block of host.querySelectorAll<HTMLElement>("pre > code.language-mermaid")) { const pre = block.parentElement; if (!pre) continue; const source = block.textContent ?? ""; try { const svg = await renderMermaid(source); if (version !== renderVersion || !pre.isConnected) return; const figure = document.createElement("figure"); figure.className = "mermaid-diagram"; figure.setAttribute("role", "img"); figure.setAttribute("aria-label", "Mermaid diagram"); figure.dataset.mermaidSource = source; figure.contentEditable = "false"; figure.innerHTML = svg; pre.replaceWith(figure); } catch (error) { if (version !== renderVersion || !pre.isConnected) return; const message = error instanceof Error ? error.message : "Mermaid 図を描画できません。"; const paragraph = document.createElement("p"); paragraph.className = "diagram-error"; paragraph.dataset.previewOnly = ""; paragraph.setAttribute("role", "alert"); paragraph.textContent = `Mermaid エラー: ${message}`; pre.after(paragraph); } } }
  function selectionElement(): Element | null {
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    if (!node || !host?.contains(node)) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  }
  function refreshActiveFormats(): void {
    const element = selectionElement();
    const active = new Set<MarkdownFormat>();
    if (!element) { activeFormats = active; return; }
    const selection = window.getSelection();
    if (selection?.rangeCount) savedRange = selection.getRangeAt(0).cloneRange();
    if (element.closest("h1")) active.add("heading-1");
    if (element.closest("h2")) active.add("heading-2");
    if (element.closest("strong, b")) active.add("bold");
    if (element.closest("em, i")) active.add("italic");
    if (element.closest("del, s, strike")) active.add("strike");
    if (element.closest("code") && !element.closest("pre")) active.add("inline-code");
    if (element.closest("pre")) active.add("code-block");
    if (element.closest("blockquote")) active.add("quote");
    if (element.closest("ul")) active.add("bullet-list");
    if (element.closest("ol")) active.add("ordered-list");
    activeFormats = active;
  }
  function ensurePreviewSelection(): Selection | null {
    const selection = window.getSelection();
    if (!selection) return null;
    const currentRange = selection.rangeCount && host.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : null;
    const desiredRange = currentRange ?? (
      savedRange && host.contains(savedRange.commonAncestorContainer)
        ? savedRange.cloneRange()
        : null
    );
    host.focus();
    if (desiredRange) {
      selection.removeAllRanges();
      selection.addRange(desiredRange);
      savedRange = desiredRange.cloneRange();
      return selection;
    }
    if (!host.lastChild) host.append(document.createElement("p"));
    const range = document.createRange();
    range.selectNodeContents(host.lastChild ?? host);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }
  function wrapPreviewSelection(tagName: "strong" | "em" | "del" | "code", placeholder: string): void {
    const selection = ensurePreviewSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    if (range.collapsed) wrapper.textContent = placeholder;
    else wrapper.append(range.extractContents());
    range.insertNode(wrapper);
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  }
  function togglePreviewInline(tagName: "strong" | "em" | "del" | "code", placeholder: string): void {
    const selection = ensurePreviewSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const anchor = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode as Element
      : selection.anchorNode?.parentElement;
    const wrapper = anchor?.closest(tagName);
    if (!wrapper || !host.contains(wrapper)) {
      wrapPreviewSelection(tagName, placeholder);
      return;
    }
    const wasCollapsed = range.collapsed;
    const nodes = [...wrapper.childNodes];
    const first = nodes[0];
    const last = nodes.at(-1);
    wrapper.replaceWith(...nodes);
    if (!first || !last) return;
    const nextRange = document.createRange();
    if (wasCollapsed) nextRange.setStartAfter(last);
    else {
      nextRange.setStartBefore(first);
      nextRange.setEndAfter(last);
    }
    nextRange.collapse(wasCollapsed);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedRange = nextRange.cloneRange();
  }
  async function formatPreview(formatName: MarkdownFormat): Promise<void> {
    if (!canEdit) return;
    if (!editing) { editing = true; await tick(); }
    ensurePreviewSelection();
    if (formatName === "bold") togglePreviewInline("strong", "太字");
    else if (formatName === "italic") togglePreviewInline("em", "斜体");
    else if (formatName === "strike") togglePreviewInline("del", "取り消し線");
    else if (formatName === "inline-code") togglePreviewInline("code", "code");
    else if (formatName === "heading-1") document.execCommand("formatBlock", false, activeFormats.has(formatName) ? "p" : "h1");
    else if (formatName === "heading-2") document.execCommand("formatBlock", false, activeFormats.has(formatName) ? "p" : "h2");
    else if (formatName === "code-block") document.execCommand("formatBlock", false, activeFormats.has(formatName) ? "p" : "pre");
    else if (formatName === "quote") document.execCommand("formatBlock", false, activeFormats.has(formatName) ? "p" : "blockquote");
    else if (formatName === "bullet-list") document.execCommand("insertUnorderedList");
    else document.execCommand("insertOrderedList");
    handleInput();
    refreshActiveFormats();
  }
  function handleInput(): void { if (!editing || !host) return; renderVersion += 1; refreshActiveFormats(); const nextMarkdown = previewToMarkdown(host); if (nextMarkdown === lastEmittedMarkdown) return; lastEmittedMarkdown = nextMarkdown; onChange(nextMarkdown); }
  function stopEditing(): void { editing = false; activeFormats = new Set(); savedRange = null; lastEmittedMarkdown = null; }
</script>
<div class="markdown-preview">
  <div class="preview-editor-bar">
    <MarkdownFormattingToolbar active={activeFormats} disabled={!canEdit} onFormat={formatPreview} />
    {#if editing}<span class="preview-editing-note">Markdown に自動反映</span>{/if}
    {#if canEdit}<button type="button" class="preview-edit-toggle" class:active={editing} aria-pressed={editing} onclick={() => editing ? stopEditing() : editing = true}>{editing ? "編集を終了" : "プレビューを編集"}</button>{/if}
  </div>
  <article class:editing class="preview-content" bind:this={host} contenteditable={editing} aria-label={editing ? "編集可能な Markdown プレビュー" : "Markdown プレビュー"} spellcheck={editing} oninput={handleInput}>{@html html}</article>
</div>
