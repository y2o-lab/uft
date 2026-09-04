<script lang="ts">
  import { onMount } from "svelte";
  import type { Compartment } from "@codemirror/state";
  import type { EditorView } from "@codemirror/view";

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
  let applyingExternalValue = false;

  function insert(text: string): void {
    if (!view) return;
    const selection = view.state.selection.main;
    view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } });
    view.focus();
  }

  $effect(() => {
    if (!view || value === view.state.doc.toString()) return;
    applyingExternalValue = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    applyingExternalValue = false;
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
    view = new EditorView({ parent: host, state: EditorState.create({ doc: value, extensions: [lineNumbers(), history(), markdown(), keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]), editable.of(EditorView.editable.of(!readOnly)), EditorView.updateListener.of((update) => { if (update.docChanged && !applyingExternalValue) onChange(update.state.doc.toString()); })] }) });
    reconfigureEditable = (nextReadOnly) => {
      if (view && editable)
        view.dispatch({
          effects: editable.reconfigure(EditorView.editable.of(!nextReadOnly)),
        });
    };
    ready = true;
    onReady(insert);
  }
</script>

<div class:loading={!ready} class="codemirror-host" bind:this={host} aria-label="Markdown editor">{#if !ready}<p>エディタを読み込んでいます…</p>{/if}</div>
