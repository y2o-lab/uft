<script lang="ts">
  import {
    Bold,
    Code2,
    Heading1,
    Heading2,
    Italic,
    List,
    ListOrdered,
    Quote,
    SquareCode,
    Strikethrough,
  } from "@lucide/svelte";
  import type { MarkdownFormat } from "../markdown/formatting";

  let {
    active = new Set<MarkdownFormat>(),
    disabled = false,
    onFormat,
  }: {
    active?: Set<MarkdownFormat>;
    disabled?: boolean;
    onFormat: (format: MarkdownFormat) => void;
  } = $props();

  const groups = [
    [
      { format: "heading-1", label: "見出し1", icon: Heading1 },
      { format: "heading-2", label: "見出し2", icon: Heading2 },
    ],
    [
      { format: "bold", label: "太字", icon: Bold },
      { format: "italic", label: "斜体", icon: Italic },
      { format: "strike", label: "取り消し線", icon: Strikethrough },
      { format: "inline-code", label: "インラインコード", icon: Code2 },
      { format: "code-block", label: "コードブロック", icon: SquareCode },
    ],
    [
      { format: "quote", label: "引用", icon: Quote },
      { format: "bullet-list", label: "箇条書き", icon: List },
      { format: "ordered-list", label: "番号付きリスト", icon: ListOrdered },
    ],
  ] as const;
</script>

<div
  class="format-toolbar"
  role="toolbar"
  aria-label="Markdown 書式"
  tabindex="0"
  onpointerdown={(event) => event.preventDefault()}
>
  {#each groups as group, groupIndex}
    {#if groupIndex > 0}<span class="format-divider" aria-hidden="true"></span>{/if}
    <span class="format-group">
      {#each group as item}
        <button
          type="button"
          class:active={active.has(item.format)}
          aria-label={item.label}
          title={item.label}
          aria-pressed={active.has(item.format)}
          {disabled}
          onclick={() => onFormat(item.format)}
        ><item.icon aria-hidden="true" /></button>
      {/each}
    </span>
  {/each}
</div>
