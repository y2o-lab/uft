<script lang="ts">
  import { CircleAlert, Trash2, X } from "@lucide/svelte";

  let { open = false, title = "確認", detail = "", confirmLabel = "削除", onConfirm = () => undefined, onCancel = () => undefined }: { open?: boolean; title?: string; detail?: string; confirmLabel?: string; onConfirm?: () => void; onCancel?: () => void } = $props();
  let cancelButton = $state<HTMLButtonElement>();

  $effect(() => {
    if (open) cancelButton?.focus();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }
</script>

{#if open}
  <div class="dialog-scrim">
    <button class="dialog-backdrop" aria-label="削除をキャンセル" onclick={onCancel}></button>
    <dialog open class="dialog danger-dialog" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-detail" onkeydown={handleKeydown}>
      <div class="dialog-heading">
        <span class="dialog-icon" aria-hidden="true"><CircleAlert /></span>
        <div>
          <span class="dialog-eyebrow">削除の確認</span>
          <h2 id="confirm-dialog-title">{title}</h2>
        </div>
        <button class="dialog-close" aria-label="閉じる" onclick={onCancel}><X aria-hidden="true" /></button>
      </div>
      <p id="confirm-dialog-detail">{detail}</p>
      <div class="dialog-reassurance"><CircleAlert aria-hidden="true" /><span>削除後も、画面下の「取り消す」から復元できます。</span></div>
      <div class="dialog-actions">
        <button class="dialog-cancel" onclick={onCancel} bind:this={cancelButton}>キャンセル</button>
        <button class="danger" onclick={onConfirm}><Trash2 aria-hidden="true" />{confirmLabel}</button>
      </div>
    </dialog>
  </div>
{/if}
