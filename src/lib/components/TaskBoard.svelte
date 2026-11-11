<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { CalendarDays, Columns3, GripVertical, Pencil, Plus } from "@lucide/svelte";
  import { taskLanes, taskPriorities, type TaskBoard, type TaskStatus } from "../markdown/task-board";

  let { initialBoard, canEdit, onChange }: {
    initialBoard: TaskBoard;
    canEdit: boolean;
    onChange: (board: TaskBoard) => boolean;
  } = $props();
  let board = $state.raw(untrack(() => initialBoard));
  const emptyTaskDraft = { text: "", priority: "", dueDate: "" };
  let newTask = $state({ ...emptyTaskDraft });
  let editingIndex = $state<number | null>(null);
  let editControl = ".edit-task";
  let boardElement = $state<HTMLElement>();
  let draft = $state({ text: "", dueDate: "" });
  let titleInput = $state<HTMLInputElement>();
  let dueInput = $state<HTMLInputElement>();
  let today = $state(localDate());
  let draggedIndex = $state<number | null>(null);
  let dropLane = $state<TaskStatus | null>(null);
  let sortBy = $state<"priority" | "dueDate" | "priorityThenDueDate">("priority");
  let completed = $derived(board.tasks.filter((task) => task.status === "done").length);
  const titleId = $props.id();
  const sortedTasks = $derived(board.tasks
    .map((task, index) => ({ task, index, priority: taskPriorities.findIndex(({ id }) => id === task.priority) }))
    .sort((a, b) => {
      const priorityOrder = a.priority - b.priority;
      if (sortBy === "priority" || (sortBy === "priorityThenDueDate" && priorityOrder !== 0)) return priorityOrder;
      const first = a.task.dueDate;
      const second = b.task.dueDate;
      if (!first) return second ? 1 : 0;
      if (!second) return -1;
      return first.localeCompare(second);
    })
  );

  onMount(() => {
    const refresh = window.setInterval(() => { today = localDate(); }, 60_000);
    return () => window.clearInterval(refresh);
  });

  function localDate(): string {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
      .join("-");
  }

  function commit(tasks: TaskBoard["tasks"]): boolean {
    const next = { ...board, tasks };
    if (!canEdit || !onChange(next)) return false;
    board = next;
    return true;
  }

  function addTask(event: SubmitEvent): void {
    event.preventDefault();
    const text = newTask.text.trim();
    if (!text) return;
    const priority = taskPriorities.find(({ id }) => id === newTask.priority)?.id;
    const dueDate = newTask.dueDate || undefined;
    if (commit([...board.tasks, { text, status: "todo", priority, dueDate }])) {
      newTask = { ...emptyTaskDraft };
    }
  }

  function moveTask(index: number, status: TaskStatus): boolean {
    if (board.tasks[index]?.status === status) return true;
    return commit(board.tasks.map((task, i) => i === index ? { ...task, status } : task));
  }

  async function focusCardControl(index: number, selector: string): Promise<void> {
    await tick();
    boardElement?.querySelector<HTMLElement>(`[data-task-index="${index}"] ${selector}`)?.focus();
  }

  function setStatus(index: number, control: HTMLSelectElement): void {
    const focused = document.activeElement === control;
    if (!moveTask(index, control.value as TaskStatus)) {
      control.value = board.tasks[index].status;
    } else if (focused) {
      void focusCardControl(index, ".task-status");
    }
  }

  function setPriority(index: number, control: HTMLSelectElement): void {
    const focused = document.activeElement === control;
    const priority = taskPriorities.find(({ id }) => id === control.value)?.id;
    if (!commit(board.tasks.map((task, i) => i === index ? { ...task, priority } : task))) {
      control.value = board.tasks[index].priority ?? "";
    } else if (focused) {
      void focusCardControl(index, "select.priority");
    }
  }

  async function startEditing(index: number, focusDate = false): Promise<void> {
    const task = board.tasks[index];
    draft = { text: task.text, dueDate: task.dueDate ?? "" };
    editingIndex = index;
    editControl = focusDate ? ".due" : ".edit-task";
    await tick();
    (focusDate ? dueInput : titleInput)?.focus();
  }

  function editTask(event: SubmitEvent, index: number): void {
    event.preventDefault();
    const text = draft.text.trim();
    const dueDate = draft.dueDate || undefined;
    if (text && commit(board.tasks.map((task, i) => i === index ? { ...task, text, dueDate } : task))) finishEditing(index);
  }

  function finishEditing(index: number): void {
    editingIndex = null;
    void focusCardControl(index, editControl);
  }

  function handleEditKeydown(event: KeyboardEvent, index: number): void {
    if (
      event.key !== "Escape" || event.defaultPrevented || event.repeat
      || event.isComposing || event.keyCode === 229
    ) return;
    if (event.target === dueInput && CSS.supports("selector(:open)") && dueInput?.matches(":open")) return;
    event.preventDefault();
    event.stopPropagation();
    finishEditing(index);
  }

  function removeTask(index: number): void {
    if (commit(board.tasks.filter((_, i) => i !== index))) {
      editingIndex = null;
      boardElement?.querySelector<HTMLInputElement>(".new-task-name")?.focus();
    }
  }

  function startDrag(event: DragEvent, index: number): void {
    if (!canEdit || !event.dataTransfer || editingIndex !== null) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-uft-kanban", String(index));
    draggedIndex = index;
  }

  function allowDrop(event: DragEvent, lane: TaskStatus): void {
    if (!canEdit || draggedIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dropLane = lane;
  }

  function endDrag(): void {
    draggedIndex = null;
    dropLane = null;
  }

  function dropTask(event: DragEvent, lane: TaskStatus): void {
    if (draggedIndex === null) return;
    event.preventDefault();
    moveTask(draggedIndex, lane);
    endDrag();
  }
</script>

{#snippet dueLabel(date: string | undefined, overdue: boolean)}
  <CalendarDays size={12} aria-hidden="true" />
  {#if date}
    <time datetime={date}>{date.replaceAll("-", "/")}</time>
    {#if overdue}<span>期限切れ</span>{/if}
  {:else}
    期限
  {/if}
{/snippet}

<section class="board" bind:this={boardElement} aria-labelledby={titleId}>
  <header>
    <div class="board-heading">
      <span class="board-icon"><Columns3 size={19} aria-hidden="true" /></span>
      <div><span class="board-label">カンバン</span><h3 id={titleId}>{board.title}</h3></div>
    </div>
    <label class="sort-control" data-preview-only>
      並べ替え
      <select bind:value={sortBy}>
        <option value="priority">優先度（高い順）</option>
        <option value="dueDate">期限（近い順）</option>
        <option value="priorityThenDueDate">優先度 → 期限</option>
      </select>
    </label>
    <div class="progress" data-preview-only>
      <span aria-live="polite">{completed} / {board.tasks.length} 件完了</span>
      <progress aria-label="タスクの進捗" value={completed} max={board.tasks.length || 1}></progress>
    </div>
  </header>

  <div class="lanes">
    {#each taskLanes as lane (lane.id)}
      {@const tasks = sortedTasks.filter(({ task }) => task.status === lane.id)}
      <section class="lane" class:drop-target={dropLane === lane.id} data-lane={lane.id} aria-label={lane.label} ondragover={(event) => allowDrop(event, lane.id)} ondrop={(event) => dropTask(event, lane.id)}>
        <h4><span class="lane-dot"></span>{lane.label}<span class="count">{tasks.length}</span></h4>
        {#each tasks as { task, index, priority } (index)}
          {@const overdue = Boolean(task.dueDate && task.dueDate < today && task.status !== "done")}
          <article class="card" data-task-index={index} class:dragging={draggedIndex === index} ondragstart={(event) => startDrag(event, index)} ondragend={endDrag}>
            {#if editingIndex === index && canEdit}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape is delegated from the focused form control) -->
              <form class="edit-form" data-preview-only onsubmit={(event) => editTask(event, index)} onkeydown={(event) => handleEditKeydown(event, index)}>
                <input aria-label="タスク名を変更" bind:this={titleInput} bind:value={draft.text} required />
                <label class="due-field">
                  期限
                  <input type="date" min="0001-01-01" max="9999-12-31" bind:this={dueInput} bind:value={draft.dueDate} />
                </label>
                {#if draft.dueDate}<button type="button" class="clear-due" onclick={() => { draft.dueDate = ""; dueInput?.focus(); }}>期限を解除</button>{/if}
                <div class="edit-actions">
                  <button type="submit">保存</button>
                  <button type="button" onclick={() => finishEditing(index)}>取消</button>
                  <button type="button" class="delete" onclick={() => removeTask(index)}>削除</button>
                </div>
              </form>
            {:else}
              <div class="card-title">
                {#if canEdit}
                  <span class="grip" aria-hidden="true" draggable={editingIndex === null}>
                    <GripVertical size={15} />
                  </span>
                  <button type="button" class="edit-task" aria-label={`${task.text} を編集`} onclick={() => void startEditing(index)}>
                    <span>{task.text}</span><Pencil size={12} aria-hidden="true" />
                  </button>
                {:else}<span>{task.text}</span>{/if}
              </div>
              {#if canEdit}
                <div class="card-controls" data-preview-only>
                  <select class="task-status" aria-label={`${task.text} のステータス`} value={task.status} onchange={(event) => setStatus(index, event.currentTarget)}>
                    {#each taskLanes as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
                  </select>
                  <select class="priority" data-priority={task.priority} aria-label={`${task.text} の優先度`} value={task.priority ?? ""} onchange={(event) => setPriority(index, event.currentTarget)}>
                    {#each taskPriorities as option (option.id)}<option value={option.id ?? ""}>優先度 {option.label}</option>{/each}
                  </select>
                  <button type="button" class="due" class:overdue
                    aria-label={`${task.text} の期限を編集${task.dueDate ? `（${task.dueDate}${overdue ? "・期限切れ" : ""}）` : ""}`}
                    onclick={() => void startEditing(index, true)}>
                    {@render dueLabel(task.dueDate, overdue)}
                  </button>
                </div>
              {/if}
              {#if task.dueDate}<span class="due due-summary" class:overdue class:print-only={canEdit} data-preview-only>{@render dueLabel(task.dueDate, overdue)}</span>{/if}
              {#if task.priority}<span class="priority priority-label" data-preview-only class:print-only={canEdit} data-priority={task.priority}>優先度 {taskPriorities[priority].label}</span>{/if}
            {/if}
          </article>
        {:else}
          <span class="empty">タスクなし</span>
        {/each}
      </section>
    {/each}
  </div>

  {#if canEdit}
    <form class="add-form" aria-label="タスクを追加" data-preview-only onsubmit={addTask}>
      <input class="new-task-name" aria-label="新しいタスク" placeholder="新しいタスクを入力…" bind:value={newTask.text} required />
      <label class="new-task-field">
        優先度
        <select bind:value={newTask.priority}>
          {#each taskPriorities as option (option.id)}<option value={option.id ?? ""}>{option.label}</option>{/each}
        </select>
      </label>
      <label class="new-task-field">
        期限
        <input type="date" min="0001-01-01" max="9999-12-31" bind:value={newTask.dueDate} />
      </label>
      <button type="submit" disabled={!newTask.text.trim()}><Plus size={15} aria-hidden="true" />追加</button>
    </form>
  {/if}
</section>

<style>
  .board { container-type: inline-size; margin: 24px 0; padding: 16px; border: 1px solid #d8e3d5; border-radius: 12px; background: #f7faf4; color: #304534; }
  header, .board-heading, .progress, h4, .card-title, .edit-actions { display: flex; align-items: center; }
  header { flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-bottom: 15px; }
  .board-heading { gap: 10px; }
  .board-icon { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; color: #3c6a42; background: #e3efde; border-radius: 9px; }
  .board-label { display: block; color: #59735b; font-size: 10px; font-weight: 700; letter-spacing: .06em; }
  .board h3 { margin: 2px 0 0; color: #304534; font-size: 17px; line-height: 1.3; }
  .sort-control { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: #49614b; font-size: 11px; }
  .progress { align-items: stretch; flex-direction: column; gap: 4px; color: #49614b; font-size: 11px; font-variant-numeric: tabular-nums; }
  progress { width: 100%; min-width: 84px; height: 5px; accent-color: #548453; }
  .lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .lane { min-height: 106px; padding: 7px; border: 1px solid transparent; border-radius: 8px; background: #eef1ea; }
  .lane[data-lane="doing"] { background: #f7f0dd; }
  .lane[data-lane="done"] { background: #e8f2e5; }
  .lane.drop-target { border-color: #58835b; box-shadow: inset 0 0 0 1px #58835b; }
  h4 { gap: 5px; margin: 1px 1px 8px; color: #3d4b3e; font-size: 12px; }
  .lane-dot { width: 7px; height: 7px; border-radius: 50%; background: #768472; }
  [data-lane="doing"] .lane-dot { background: #ae7625; }
  [data-lane="done"] .lane-dot { background: #4e8352; }
  .count { margin-left: auto; font-variant-numeric: tabular-nums; }
  .card { display: grid; gap: 7px; margin-top: 6px; padding: 8px; border: 1px solid #dce4d8; border-radius: 7px; background: #fffefa; box-shadow: 0 1px 2px #2634260b; }
  .card.dragging { opacity: .45; }
  .card-title { align-items: start; gap: 4px; font-size: 12px; font-weight: 600; line-height: 1.45; }
  .grip { display: flex; flex-shrink: 0; margin-left: -4px; color: #74836f; cursor: grab; }
  .edit-task { display: flex; align-items: start; gap: 4px; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; font: inherit; }
  .edit-task :global(svg) { flex-shrink: 0; margin-left: auto; margin-top: 2px; opacity: .68; }
  .edit-task:hover { color: #3e7042; text-decoration: underline; }
  .empty { color: #667461; font-size: 11px; }
  .card-controls { display: flex; flex-wrap: wrap; gap: 4px; }
  .priority-label { width: fit-content; padding: 3px 5px; border-radius: 5px; font-size: 11px; }
  select, input, .edit-actions button, .add-form button { min-width: 0; border: 1px solid #d2decf; border-radius: 5px; background: #fffefa; color: #334d36; font: inherit; }
  .due { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px 4px; max-width: 100%; padding: 3px 5px; border: 1px solid #d2decf; border-radius: 5px; background: #fffefa; color: #425744; font: inherit; font-size: 11px; }
  .due time { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .due.overdue { border-color: #e6b9ae; background: #f9e8e3; color: #8b3b2d; }
  button.due:hover { border-color: currentColor; }
  .due-summary { width: fit-content; }
  .print-only { display: none; }
  .due-field { display: grid; gap: 4px; margin-top: 6px; color: #49614b; font-size: 11px; }
  .due-field input { padding: 5px 3px; }
  .clear-due { padding: 3px 0; border: 0; background: transparent; color: #425744; font: inherit; font-size: 11px; text-decoration: underline; }
  select { width: fit-content; max-width: 100%; padding: 3px 4px; font-size: 11px; }
  .priority[data-priority="high"] { border-color: #e6c5bd; background: #f9e8e3; color: #8b3b2d; }
  .priority[data-priority="medium"] { border-color: #e3d3ab; background: #f8f0db; color: #735512; }
  .priority[data-priority="low"] { border-color: #cbdbea; background: #eaf2f8; color: #305774; }
  .add-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto; align-items: end; gap: 7px; margin-top: 12px; }
  .new-task-name { grid-column: 1 / -1; }
  .new-task-field { display: grid; min-width: 0; gap: 4px; color: #49614b; font-size: 11px; }
  .new-task-field select { width: 100%; padding-inline: 6px; font-size: 12px; }
  .new-task-field input { padding-inline: 5px; }
  .add-form input, .add-form select, .add-form button { min-height: 36px; }
  input { width: 100%; padding: 7px 8px; font-size: 12px; }
  .edit-actions { flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .edit-actions button { padding: 4px; font-size: 11px; }
  .edit-actions .delete { color: #a14742; }
  .add-form button { display: flex; flex: none; align-items: center; gap: 4px; padding: 6px 8px; background: #e5f0e1; font-size: 12px; font-weight: 650; }
  .add-form button:disabled { opacity: .65; cursor: default; }
  @container (min-width: 600px) {
    .add-form { grid-template-columns: minmax(0, 1fr) 104px 138px auto; }
    .new-task-name { grid-column: auto; }
  }
  @container (max-width: 340px) {
    .add-form input, .add-form select, .add-form button { min-height: 40px; }
    .lanes { grid-template-columns: 1fr; }
    .lane { min-height: 64px; }
  }
  @media (max-width: 600px) {
    .lanes { grid-template-columns: 1fr; }
    .lane { min-height: 64px; }
  }
  @media (pointer: coarse) {
    .grip { display: none; }
    .sort-control select, .card-controls select, .card-controls button, .edit-actions button,
    .edit-form input, .clear-due, .add-form input, .add-form select, .add-form button { min-height: 44px; }
    .edit-task { min-height: 44px; align-items: center; }
  }
  @media print {
    .sort-control, .add-form, .card-controls, .grip, .card-title :global(svg) { display: none; }
    .priority-label.print-only { display: block; }
    .due-summary.print-only { display: inline-flex; }
    .board { break-inside: avoid; }
  }
</style>
