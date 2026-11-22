<script lang="ts">
  import DocumentSearch from "../../src/lib/components/DocumentSearch.svelte";

  let { text }: { text: string } = $props();
  let target = $state<HTMLElement>();
</script>

<section class="document-search-scope">
  <DocumentSearch {target} revision={text} documentKey="example" label="プレビュー" />
  <article bind:this={target} tabindex="-1">{text}</article>
</section>
