<script lang="ts">
  import { onMount } from "svelte";
  import type { EditorView } from "@codemirror/view";

  let { value = "", readOnly = false, onChange = () => undefined, onReady = () => undefined }: { value?: string; readOnly?: boolean; onChange?: (value: string) => void; onReady?: (insert: (text: string) => void) => void } = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let ready = $state(false);

  function insert(text: string): void {
    if (!view) return;
    const selection = view.state.selection.main;
    view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } });
    view.focus();
  }

  $effect(() => {
    if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  });

  onMount(() => {
    void setup();
    return () => view?.destroy();
  });

  async function setup(): Promise<void> {
    const [{ EditorState }, { EditorView, keymap, lineNumbers }, { defaultKeymap, history, historyKeymap, indentWithTab }, { markdown }] = await Promise.all([
      import("@codemirror/state"), import("@codemirror/view"), import("@codemirror/commands"), import("@codemirror/lang-markdown"),
    ]);
    view = new EditorView({ parent: host, state: EditorState.create({ doc: value, extensions: [lineNumbers(), history(), markdown(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), EditorView.editable.of(!readOnly), EditorView.updateListener.of((update) => { if (update.docChanged) onChange(update.state.doc.toString()); })] }) });
    ready = true;
    onReady(insert);
  }
</script>

<div class:loading={!ready} class="codemirror-host" bind:this={host} aria-label="Markdown editor">{#if !ready}<p>エディタを読み込んでいます…</p>{/if}</div>
