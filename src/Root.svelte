<script lang="ts">
  import { onMount } from "svelte";
  import App from "./App.svelte";
  import ErrorPage from "./lib/components/ErrorPage.svelte";

  let unexpectedError = $state<unknown>(null);

  function reload(): void {
    window.location.reload();
  }

  onMount(() => {
    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      unexpectedError = event.error ?? new Error(event.message);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      unexpectedError = event.reason;
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  });
</script>

{#if unexpectedError}
  <ErrorPage
    code="UNEXPECTED ERROR"
    title="問題が発生しました"
    description="画面を表示できませんでした。もう一度試すか、ホームへ戻ってください。"
    actionLabel="再読み込み"
    onAction={reload}
  />
{:else}
  <svelte:boundary>
    <App />
    {#snippet failed(_error, reset)}
      <ErrorPage
        code="UNEXPECTED ERROR"
        title="問題が発生しました"
        description="画面を表示できませんでした。もう一度試すか、ホームへ戻ってください。"
        actionLabel="もう一度試す"
        onAction={reset}
      />
    {/snippet}
  </svelte:boundary>
{/if}
