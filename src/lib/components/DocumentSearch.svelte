<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { Compartment, StateEffect } from "@codemirror/state";
  import { Decoration, EditorView } from "@codemirror/view";
  import { findTextMatches, previewSearchRanges } from "../markdown/document-search";

  let { target, editor, revision = "", documentKey = "", label }: {
    target?: HTMLElement;
    editor?: EditorView;
    revision?: string;
    documentKey?: string;
    label: string;
  } = $props();
  let open = $state(false);
  let query = $state("");
  let current = $state(0);
  let scrollRequest = $state(0);
  let lastScrollRequest = 0;
  let count = $state(0);
  let input = $state<HTMLInputElement>(undefined!);
  let panel: HTMLDivElement;
  let updateMatches = $state<((index: number, scroll: boolean) => void) | undefined>(undefined);
  const compartment = new Compartment();
  const content = $derived(revision);
  const documentIdentity = $derived(documentKey);
  let lastText: string | undefined;
  let lastQuery: string | undefined;
  const highlightName = $derived(`uft-find-${label === "エディタ" ? "source" : "preview"}`);
  type HighlightRegistry = { set: (name: string, value: unknown) => void; delete: (name: string) => void };
  const highlights = () => (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const clearPreview = () => {
    highlights()?.delete(highlightName);
    highlights()?.delete(`${highlightName}-active`);
  };

  async function show(): Promise<void> {
    open = true;
    await tick();
    input.focus();
    input.select();
  }
  function close(): void {
    open = false;
    if (editor) editor.focus();
    else target?.focus({ preventScroll: true });
  }
  function navigate(direction: number): void {
    if (!count) return;
    current = (current + direction + count) % count;
    scrollRequest += 1;
  }
  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement && !event.isComposing) {
      event.preventDefault();
      navigate(event.shiftKey ? -1 : 1);
    }
  }
  onMount(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      const scope = panel?.closest<HTMLElement>(".document-search-scope");
      if (!scope || !scope.getBoundingClientRect().height || !scope.getBoundingClientRect().width) return;
      const focusedScope = document.activeElement?.closest(".document-search-scope");
      if (focusedScope && focusedScope !== scope) return;
      if (!focusedScope && document.activeElement?.closest('input,textarea,[role="dialog"],[contenteditable="true"]')) return;
      event.preventDefault();
      void show();
    };
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("keydown", shortcut); clearPreview(); };
  });
  $effect(() => {
    documentIdentity;
    query = "";
    current = 0;
    open = false;
  });
  $effect(() => {
    if (!editor) return;
    editor.dispatch({ effects: StateEffect.appendConfig.of(compartment.of([])) });
  });
  $effect(() => {
    const text = content;
    const search = open ? query : "";
    const viewTarget = editor;
    const previewTarget = target;
    return untrack(() => {
      // Saving can replace the workspace object without changing its text.
      // Preserve the active result across those updates.
      if (lastText !== text || lastQuery !== search) current = 0;
      lastText = text;
      lastQuery = search;
      if (viewTarget) {
        const matches = findTextMatches(viewTarget.state.doc.toString(), search);
        count = matches.length;
        const view = viewTarget;
        updateMatches = (index, scroll) => {
          view.dispatch({ effects: compartment.reconfigure(
            EditorView.decorations.compute(["doc"], (state) => Decoration.set(
              findTextMatches(state.doc.toString(), search).map((match, position) =>
                Decoration.mark({ class: position === index ? "document-match document-match-active" : "document-match" }).range(match.from, match.to)
              )
            ))
          ) });
          const match = matches[index];
          if (match && scroll) view.dispatch({ effects: EditorView.scrollIntoView(match.from, { y: "center" }) });
        };
      } else if (previewTarget) {
        if (!search) {
          clearPreview();
          count = 0;
          updateMatches = undefined;
          return;
        }
        const host = previewTarget;
        const update = () => {
          const ranges = previewSearchRanges(host, search);
          count = ranges.length;
          if (current >= count) current = 0;
          updateMatches = (index, scroll) => {
            clearPreview();
            const HighlightClass = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
            if (HighlightClass) {
              highlights()?.set(highlightName, new HighlightClass(...ranges));
              if (ranges[index]) highlights()?.set(`${highlightName}-active`, new HighlightClass(ranges[index]));
            }
            const range = ranges[index];
            if (range && scroll) {
              // Scroll the preview pane itself, preserving the search input focus.
              const pane = host.closest(".preview-pane");
              const bounds = range.getBoundingClientRect();
              if (pane) pane.scrollTop += bounds.top - pane.getBoundingClientRect().top - pane.clientHeight / 2;
            }
          };
          updateMatches(current, false);
        };
        update();
        const observer = new MutationObserver(update);
        observer.observe(host, { childList: true, characterData: true, subtree: true });
        return () => { observer.disconnect(); clearPreview(); };
      }
    });
  });
  $effect(() => {
    const update = updateMatches;
    const index = current;
    const request = scrollRequest;
    untrack(() => {
      // Content updates repaint matches in place. Only explicit search actions
      // request scrolling, including navigation when there is just one result.
      const scroll = request !== lastScrollRequest;
      lastScrollRequest = request;
      update?.(index, scroll);
    });
  });
</script>

<div bind:this={panel} class="document-search" class:search-open={open}>
  {#if open}
    <div class="document-search-controls" role="search" aria-label={`${label}内を検索`}>
      <input bind:this={input} bind:value={query} aria-label={`${label}内の検索語`} placeholder="文書内を検索…" autocomplete="off" onkeydown={keydown} oninput={() => { current = 0; scrollRequest += 1; }} />
      <output aria-live="polite">{query ? count ? `${current + 1} / ${count}` : "一致なし" : "検索語を入力"}</output>
      <button type="button" onkeydown={keydown} aria-label="前の一致" title="前の一致 (Shift+Enter)" disabled={!count} onclick={() => navigate(-1)}>↑</button>
      <button type="button" onkeydown={keydown} aria-label="次の一致" title="次の一致 (Enter)" disabled={!count} onclick={() => navigate(1)}>↓</button>
      <button type="button" onkeydown={keydown} aria-label="検索を閉じる" title="検索を閉じる (Esc)" onclick={close}>×</button>
    </div>
  {:else}
    <button type="button" class="document-search-trigger" aria-label={`${label}内を検索`} title="文書内を検索 (⌘/Ctrl+F)" onclick={show}>検索 <kbd>⌘/Ctrl F</kbd></button>
  {/if}
</div>
