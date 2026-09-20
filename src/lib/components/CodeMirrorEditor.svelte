<script lang="ts">
  import { onMount } from "svelte";
  import type { Compartment } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";
  import MarkdownFormattingToolbar from "./MarkdownFormattingToolbar.svelte";
  import {
    activeMarkdownFormats,
    applyMarkdownFormat,
    type MarkdownFormat,
  } from "../markdown/formatting";

  let { value = "", readOnly = false, onChange = () => undefined, onReady = () => undefined }: { value?: string; readOnly?: boolean; onChange?: (value: string) => void; onReady?: (insert: (text: string) => void) => void } = $props();
  let host: HTMLDivElement;
  // The view is reactive so the external-value effect also runs once the
  // asynchronous CodeMirror setup has completed. Without this, a value that
  // arrives from another tab can update the preview while leaving this editor
  // instance on its initial document.
  let view = $state<EditorView | undefined>(undefined);
  let editable: Compartment | undefined;
  let reconfigureEditable: ((readOnly: boolean) => void) | undefined;
  let ready = $state(false);
  let activeFormats = $state(new Set<MarkdownFormat>());
  let applyingExternalValue = false;

  function insert(text: string): void {
    if (!view) return;
    const selection = view.state.selection.main;
    view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } });
    view.focus();
  }

  function refreshActiveFormats(): void {
    if (!view) return;
    const selection = view.state.selection.main;
    activeFormats = activeMarkdownFormats(view.state.doc.toString(), {
      from: selection.from,
      to: selection.to,
    });
  }

  function format(formatName: MarkdownFormat): void {
    if (!view || readOnly) return;
    const selection = view.state.selection.main;
    const result = applyMarkdownFormat(
      view.state.doc.toString(),
      { from: selection.from, to: selection.to },
      formatName,
    );
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result.text },
      selection: { anchor: result.from, head: result.to },
    });
    view.focus();
    refreshActiveFormats();
  }

  $effect(() => {
    if (!view || value === view.state.doc.toString()) return;
    applyingExternalValue = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingExternalValue = false;
    refreshActiveFormats();
  });

  $effect(() => {
    reconfigureEditable?.(readOnly);
  });

  onMount(() => {
    void setup();
    return () => view?.destroy();
  });

  async function setup(): Promise<void> {
    const [{ EditorState, Compartment }, { EditorView, keymap, lineNumbers }, { defaultKeymap, history, historyKeymap, indentWithTab }, { markdown }] = await Promise.all([
      import("@codemirror/state"), import("@codemirror/view"), import("@codemirror/commands"), import("@codemirror/lang-markdown"),
    ]);
    editable = new Compartment();
    view = new EditorView({ parent: host, state: EditorState.create({ doc: value, extensions: [lineNumbers(), history(), markdown(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), editable.of(EditorView.editable.of(!readOnly)), EditorView.updateListener.of((update) => { if (update.docChanged && !applyingExternalValue) onChange(update.state.doc.toString()); if (update.docChanged || update.selectionSet) refreshActiveFormats(); })] }) });
    reconfigureEditable = (nextReadOnly) => {
      if (view && editable)
        view.dispatch({
          effects: editable.reconfigure(EditorView.editable.of(!nextReadOnly)),
        });
    };
    ready = true;
    refreshActiveFormats();
    onReady(insert);
  }
</script>

<div class="markdown-source-editor">
  <MarkdownFormattingToolbar active={activeFormats} disabled={readOnly || !ready} onFormat={format} />
  <div class:loading={!ready} class="codemirror-host" bind:this={host} aria-label="Markdown editor">{#if !ready}<p>エディタを読み込んでいます…</p>{/if}</div>
</div>
