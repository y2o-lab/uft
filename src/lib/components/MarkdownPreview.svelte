<script lang="ts">
  import DocumentSearch from "./DocumentSearch.svelte";
  import { onMount, tick } from "svelte";
  import MarkdownFormattingToolbar from "./MarkdownFormattingToolbar.svelte";
  import { renderMermaid } from "../markdown/mermaid";
  import { previewToMarkdown } from "../markdown/preview-to-markdown";
  import { renderMarkdown } from "../markdown/preview";
  import { decorateListHandles, moveListItem } from "../markdown/list-reordering";
  import { setTaskChecked } from "../markdown/task-list";
  import type { MarkdownFormat } from "../markdown/formatting";
  let { markdown = "", assetUrls = {}, documentPath = "docs/overview.md", documentKey = "", canEdit = false, onChange = () => undefined }: { markdown?: string; assetUrls?: Record<string, string>; documentPath?: string; documentKey?: string; canEdit?: boolean; onChange?: (markdown: string) => void } = $props();
  let html = $state(""); let host = $state<HTMLElement>(undefined!); let renderVersion = 0; let editing = $state(false); let lastEmittedMarkdown: string | null = null; let activeFormats = $state(new Set<MarkdownFormat>()); let savedRange: Range | null = null;
  let toolbarHeight = $state(0);
  let draggedItem: HTMLLIElement | null = null;
  let dropTarget: HTMLLIElement | null = null;
  let dropAfter = false;
  $effect(() => {
    if (html && host) {
      decorateListHandles(host, editing && canEdit);
      clearListDrag();
    }
  });
  let pointerStart: { x: number; y: number } | null = null;
  $effect(() => { if (editing && markdown === lastEmittedMarkdown) return; void updateHtml(markdown, assetUrls, documentPath); });
  $effect(() => { if (!canEdit && editing) editing = false; });
  $effect(() => {
    const disabled = !canEdit;
    if (!html || !host) return;
    for (const checkbox of host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.disabled = disabled;
  });
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
    if (element.closest("li")?.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')) active.add("task-list");
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
  function togglePreviewTasks(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const selectedItems = () => {
      const range = selection.getRangeAt(0);
      return [...host.querySelectorAll("li")].filter((item) =>
        range.intersectsNode(item) && ![...item.querySelectorAll("li")].some((child) => range.intersectsNode(child))
      );
    };
    if (!selectedItems().length) document.execCommand("insertUnorderedList");
    const items = selectedItems();
    const checkboxFor = (item: Element) => item.querySelector<HTMLInputElement>(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
    const remove = items.length > 0 && items.every((item) => checkboxFor(item));
    for (const item of items) {
      const checkbox = checkboxFor(item);
      if (remove) {
        checkbox?.remove();
        item.classList.remove("task-list-item");
      } else if (!checkbox) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.contentEditable = "false";
        (item.querySelector(":scope > p") ?? item).prepend(input, document.createTextNode(" "));
        item.classList.add("task-list-item");
      }
    }
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
    else if (formatName === "task-list") togglePreviewTasks();
    else document.execCommand("insertOrderedList");
    handleInput();
    refreshActiveFormats();
  }
  function handleInput(event?: Event): void { if (event?.target instanceof HTMLInputElement && event.target.type === "checkbox") return; if (!editing || !host) return; renderVersion += 1; decorateListHandles(host, canEdit); refreshActiveFormats(); const nextMarkdown = previewToMarkdown(host); if (nextMarkdown === lastEmittedMarkdown) return; lastEmittedMarkdown = nextMarkdown; onChange(nextMarkdown); }
  function handleTaskChange(event: Event): void {
    const checkbox = event.target;
    if (!canEdit || !(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;
    checkbox.toggleAttribute("checked", checkbox.checked);
    if (editing) { handleInput(); return; }
    const index = [...host.querySelectorAll('input[type="checkbox"]')].indexOf(checkbox);
    const nextMarkdown = setTaskChecked(markdown, index, checkbox.checked);
    if (nextMarkdown !== markdown) onChange(nextMarkdown);
  }
  function clearListDrag(): void {
    draggedItem?.classList.remove("list-dragging");
    dropTarget?.removeAttribute("data-list-drop");
    draggedItem = null;
    dropTarget = null;
    pointerStart = null;
  }
  function startListDrag(event: DragEvent): void {
    const handle = event.target instanceof Element ? event.target.closest("[data-list-handle]") : null;
    if (!editing || !canEdit || !handle || !event.dataTransfer) return;
    const item = handle.closest("li");
    if (!item || !host.contains(item)) return;
    draggedItem = item;
    pointerStart = null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-uft-list-item", "move");
    event.dataTransfer.setDragImage(item, 0, 0);
    item.classList.add("list-dragging");
    event.stopPropagation();
  }
  function overListItem(event: DragEvent): void {
    if (!editing || !canEdit || !draggedItem) return;
    // Suppress the contenteditable browser drop, which would insert drag text.
    event.preventDefault();
    event.stopPropagation();
    dropTarget?.removeAttribute("data-list-drop");
    dropTarget = null;
    const target = event.target instanceof Element ? event.target.closest("li") : null;
    if (!target || !host.contains(target) || target === draggedItem || draggedItem.contains(target)) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }
    dropTarget = target;
    const bounds = target.getBoundingClientRect();
    dropAfter = event.clientY >= bounds.top + bounds.height / 2;
    target.dataset.listDrop = dropAfter ? "after" : "before";
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }
  function dropListItem(event: DragEvent): void {
    if (!draggedItem) return;
    overListItem(event);
    const moved = editing && canEdit && dropTarget && moveListItem(host, draggedItem, dropTarget, dropAfter);
    clearListDrag();
    if (moved) { savedRange = null; handleInput(); }
  }
  function previewKeydown(event: KeyboardEvent): void {
    const handle = event.target instanceof Element ? event.target.closest("[data-list-handle]") : null;
    if (editing && canEdit && handle && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const item = handle.closest("li");
      const after = event.key === "ArrowDown";
      const sibling = after ? item?.nextElementSibling : item?.previousElementSibling;
      if (item && sibling instanceof HTMLLIElement && moveListItem(host, item, sibling, after)) {
        handleInput();
        item.querySelector<HTMLButtonElement>("[data-list-handle]")?.focus();
      }
      return;
    }
    selectPreviewContents(event);
  }
  function stopEditing(): void { editing = false; activeFormats = new Set(); savedRange = null; lastEmittedMarkdown = null; }
  function selectPreviewContents(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "a") return;
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(host);
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    if (editing) refreshActiveFormats();
  }
  function selectPreviewLine(event: MouseEvent): void {
    const start = pointerStart;
    pointerStart = null;
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input[type="checkbox"], [data-list-handle]')) return;
    const line = target.closest("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th");
    if (!line || !host.contains(line)) return;
    window.setTimeout(() => {
      if (!host.contains(line)) return;
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(line);
      selection.removeAllRanges();
      selection.addRange(range);
      savedRange = range.cloneRange();
      if (editing) refreshActiveFormats();
    }, 0);
  }
</script>
<div class="markdown-preview document-search-scope" style:--preview-toolbar-height={`${toolbarHeight}px`}>
  <div class="preview-editor-bar" bind:offsetHeight={toolbarHeight}>
    <MarkdownFormattingToolbar active={activeFormats} disabled={!canEdit} onFormat={formatPreview} />
    {#if editing}<span class="preview-editing-note">Markdown に自動反映</span>{/if}
    {#if canEdit}<button type="button" class="preview-edit-toggle" class:active={editing} aria-pressed={editing} onclick={() => editing ? stopEditing() : editing = true}>{editing ? "編集を終了" : "プレビューを編集"}</button>{/if}
  </div>
  <DocumentSearch target={host} revision={html} {documentKey} label="プレビュー" />
  <div class:editing class="preview-content" bind:this={host} contenteditable={editing} role="textbox" aria-multiline="true" aria-readonly={!editing} tabindex="0" aria-label={editing ? "編集可能な Markdown プレビュー" : "Markdown プレビュー"} spellcheck={editing} oninput={handleInput} onchange={handleTaskChange} onkeydown={previewKeydown} ondragstart={startListDrag} ondragover={overListItem} ondrop={dropListItem} ondragend={clearListDrag} onpointerdown={(event) => pointerStart = { x: event.clientX, y: event.clientY }} onclick={selectPreviewLine}>{@html html}</div>
</div>
