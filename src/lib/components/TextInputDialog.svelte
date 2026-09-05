<script lang="ts">
  import { tick } from "svelte";
  import { PencilLine, X } from "@lucide/svelte";

  let {
    open = false,
    title = "入力",
    detail = "",
    label = "入力内容",
    value = "",
    options = [],
    placeholder = "",
    submitLabel = "保存",
    onSubmit = (_value: string) => undefined,
    onCancel = () => undefined,
  }: {
    open?: boolean;
    title?: string;
    detail?: string;
    label?: string;
    value?: string;
    options?: string[];
    placeholder?: string;
    submitLabel?: string;
    onSubmit?: (value: string) => void;
    onCancel?: () => void;
  } = $props();

  let input = $state<HTMLInputElement | HTMLSelectElement>();
  let draft = $state("");

  $effect(() => {
    if (!open) return;
    draft = value;
    void tick().then(() => input?.focus());
  });

  function submit(): void {
    const next = draft.trim();
    if (next) onSubmit(next);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }
</script>

{#if open}
  <div class="dialog-scrim">
    <button class="dialog-backdrop" aria-label="入力をキャンセル" onclick={onCancel}></button>
    <dialog open class="dialog input-dialog" aria-labelledby="text-input-dialog-title" aria-describedby={detail ? "text-input-dialog-detail" : undefined} onkeydown={handleKeydown}>
      <div class="dialog-heading">
        <span class="dialog-icon" aria-hidden="true"><PencilLine /></span>
        <div>
          <span class="dialog-eyebrow">EDITOR</span>
          <h2 id="text-input-dialog-title">{title}</h2>
        </div>
        <button class="dialog-close" aria-label="閉じる" onclick={onCancel}><X aria-hidden="true" /></button>
      </div>
      {#if detail}<p id="text-input-dialog-detail">{detail}</p>{/if}
      <form onsubmit={(event) => { event.preventDefault(); submit(); }}>
        <label class="dialog-field" for="text-input-dialog-value">{label}</label>
        {#if options.length}
          <select bind:this={input} id="text-input-dialog-value" bind:value={draft}>
            {#each options as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else}
          <input bind:this={input} id="text-input-dialog-value" bind:value={draft} {placeholder} autocomplete="off" />
        {/if}
        <div class="dialog-actions">
          <button type="button" class="dialog-cancel" onclick={onCancel}>キャンセル</button>
          <button type="submit" class="dialog-submit" disabled={!draft.trim()}>{submitLabel}</button>
        </div>
      </form>
    </dialog>
  </div>
{/if}

<style>
  .input-dialog {
    border-color: #d5e3d2;
    background: linear-gradient(145deg, #fff 0%, #fbfef9 100%);
  }

  .input-dialog .dialog-icon {
    border-color: #d9e8d6;
    background: #eef7eb;
    color: #4d7d50;
  }

  .input-dialog .dialog-eyebrow { color: #5f8960; }
  .input-dialog p { white-space: pre-line; }
  .dialog-field { display: block; margin-bottom: 7px; color: #526651; font-size: 12px; font-weight: 700; }

  .input-dialog input,
  .input-dialog select {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid #cbd9c8;
    border-radius: 10px;
    outline: 0;
    background: #fff;
    color: #314235;
    padding: 10px 11px;
    font: 14px ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .input-dialog input:focus,
  .input-dialog select:focus { border-color: #649363; box-shadow: 0 0 0 3px #dcebd9; }

  .dialog-actions .dialog-submit {
    border-color: #3f7043;
    background: linear-gradient(135deg, #4e814f, #376d3d);
    color: #fff;
    box-shadow: 0 5px 12px rgb(54 107 59 / 23%);
  }

  .dialog-actions .dialog-submit:hover:not(:disabled) { background: linear-gradient(135deg, #5b915b, #417a47); }
  .dialog-actions .dialog-submit:disabled { cursor: not-allowed; opacity: .5; }
</style>
