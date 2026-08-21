<script lang="ts">
  import { diffMarkdown, summarizeDiff } from "../markdown/diff";

  let { before = "", after = "" }: { before?: string; after?: string } = $props();
  let lines = $derived(diffMarkdown(before, after));
  let summary = $derived(summarizeDiff(lines));
</script>

<section class="markdown-diff" aria-label="Markdown diff" aria-live="polite">
  <header class="diff-summary">
    <span class="diff-additions">+{summary.additions} additions</span>
    <span class="diff-removals">−{summary.removals} removals</span>
    <span>{summary.unchanged} unchanged</span>
  </header>
  <div class="diff-lines" role="table" aria-label="Line-by-line Markdown changes">
    {#each lines as line, index (`${line.kind}-${line.oldLine}-${line.newLine}-${index}`)}
      <div class:added={line.kind === "added"} class:removed={line.kind === "removed"} class="diff-line" role="row">
        <span class="diff-marker" aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span>
        <span class="diff-line-number" aria-label={line.oldLine ? `Previous line ${line.oldLine}` : "No previous line"}>{line.oldLine ?? ""}</span>
        <span class="diff-line-number" aria-label={line.newLine ? `Current line ${line.newLine}` : "No current line"}>{line.newLine ?? ""}</span>
        <code>{line.content || " "}</code>
      </div>
    {/each}
  </div>
</section>
