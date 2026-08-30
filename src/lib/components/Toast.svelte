<script lang="ts">let { message = "", tone = "info" }: { message?: string; tone?: "info" | "error" } = $props();</script>
{#if message}<div class:error={tone === "error"} class="toast" role="status">{message}</div>{/if}
