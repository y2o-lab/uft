<script lang="ts">
  type ErrorPageProps = {
    code: string;
    title: string;
    description: string;
    actionLabel?: string;
    actionHref?: string;
    onAction?: () => void;
  };

  let {
    code,
    title,
    description,
    actionLabel = "ホームへ戻る",
    actionHref = "/",
    onAction,
  }: ErrorPageProps = $props();
</script>

<svelte:head>
  <title>{code} — UFT</title>
</svelte:head>

<main class="error-page">
  <a class="brand" href="/" aria-label="UFT ホーム">
    <span class="brand-mark">u</span><span>uft</span>
  </a>
  <section class="error-card" aria-labelledby="error-title">
    <p class="eyebrow">{code}</p>
    <h1 id="error-title">{title}</h1>
    <p>{description}</p>
    <div class="error-actions">
      {#if onAction}
        <button type="button" onclick={onAction}>{actionLabel}</button>
      {:else}
        <a href={actionHref}>{actionLabel}</a>
      {/if}
      <a class="secondary-action" href="/">ホームへ戻る</a>
    </div>
  </section>
</main>

<style>
  .error-page {
    display: grid;
    min-height: 100vh;
    align-content: center;
    justify-items: center;
    gap: 28px;
    padding: 40px 20px;
    background:
      radial-gradient(circle at 12% 0, #edf5e9, transparent 33%),
      #fbfcf8;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #2f3d31;
    font-size: 19px;
    font-weight: 750;
    text-decoration: none;
  }

  .brand-mark {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 7px;
    background: #263529;
    color: #f6ec92;
    font-family: Georgia, serif;
    font-size: 21px;
    font-style: italic;
  }

  .error-card {
    width: min(560px, 100%);
    padding: clamp(30px, 7vw, 54px);
    border: 1px solid #dbe4d6;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 18px 45px #40513d14;
  }

  .eyebrow {
    margin: 0;
    color: #7c987b;
    font: 10px ui-monospace, monospace;
    letter-spacing: 0.12em;
  }

  h1 {
    margin: 8px 0 17px;
    color: #304134;
    font: 600 clamp(28px, 5vw, 42px) / 1.12 Georgia, serif;
  }

  .error-card > p:not(.eyebrow) {
    margin: 0;
    color: #617061;
    line-height: 1.75;
  }

  .error-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 28px;
  }

  .error-actions a,
  .error-actions button {
    border: 1px solid #2d4932;
    border-radius: 7px;
    background: #2d4932;
    color: white;
    padding: 10px 14px;
    font: inherit;
    font-weight: 650;
    text-decoration: none;
  }

  .error-actions .secondary-action {
    border-color: #cbd7c8;
    background: #fff;
    color: #3d593f;
  }
</style>
