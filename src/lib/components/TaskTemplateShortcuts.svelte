<script lang="ts">
  import { Columns3, ListTodo } from "@lucide/svelte";
  import { appendTaskTemplate, taskTemplates } from "../markdown/task-board";

  let { content, onInsert }: { content: string; onInsert: (markdown: string) => void } = $props();

  const shortcuts = [
    { label: "TODO リストを挿入", icon: ListTodo, markdown: taskTemplates.todo },
    { label: "カンバンを挿入", icon: Columns3, markdown: taskTemplates.kanban },
  ];

  function insert(template: string): void {
    onInsert(appendTaskTemplate(content, template));
  }
</script>

<div class="task-shortcuts" role="group" aria-label="タスクテンプレート">
  {#each shortcuts as shortcut (shortcut.label)}
    <button type="button" aria-label={shortcut.label} title={shortcut.label} onclick={() => insert(shortcut.markdown)}>
      <shortcut.icon size={17} aria-hidden="true" />
    </button>
  {/each}
</div>

<style>
  .task-shortcuts {
    display: flex;
    flex: none;
    gap: 3px;
    margin-right: auto;
    margin-left: 10px;
    padding: 2px;
    border: 1px solid #d4dfd1;
    border-radius: 6px;
    background: #f4f8f1;
  }

  button {
    display: grid;
    width: 30px;
    height: 26px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #345b39;
  }

  button:hover { background: #e4f0df; }
  button:active { background: #d5e8cf; }
  button:focus-visible { outline: 2px solid #6e9c70; outline-offset: 1px; }

  @media (max-width: 850px) {
    .task-shortcuts { margin-left: 0; }
    button { width: 44px; height: 44px; }
  }
</style>
