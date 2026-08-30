<script lang="ts">
  let { open = false, title = "確認", detail = "", confirmLabel = "削除", onConfirm = () => undefined, onCancel = () => undefined }: { open?: boolean; title?: string; detail?: string; confirmLabel?: string; onConfirm?: () => void; onCancel?: () => void } = $props();
</script>
{#if open}<div class="dialog-scrim"><dialog open class="dialog" aria-label={title}><h2>{title}</h2><p>{detail}</p><div class="dialog-actions"><button onclick={onCancel}>キャンセル</button><button class="danger" onclick={onConfirm}>{confirmLabel}</button></div></dialog></div>{/if}
