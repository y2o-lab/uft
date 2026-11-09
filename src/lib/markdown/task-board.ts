import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const markdownParser = unified().use(remarkParse).use(remarkGfm).freeze();

export const TASK_BOARD_LANGUAGE = "uft-kanban";
export const taskLanes = [
  { id: "todo", label: "未着手" },
  { id: "doing", label: "進行中" },
  { id: "done", label: "完了" },
] as const;

export const taskPriorities = [
  { id: "high", label: "高" },
  { id: "medium", label: "中" },
  { id: "low", label: "低" },
  { id: undefined, label: "なし" },
] as const;

export type TaskStatus = (typeof taskLanes)[number]["id"];
type TaskPriority = (typeof taskPriorities)[number]["id"];
type Task = {
  [field: string]: unknown;
  text: string;
  status: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
};
export type TaskBoard = {
  title: string;
  tasks: Task[];
  [field: string]: unknown;
};

function isTaskDueDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function readTaskBoard(value: string): TaskBoard | null {
  try {
    const data: unknown = JSON.parse(value);
    if (
      !data ||
      typeof data !== "object" ||
      !("title" in data) ||
      typeof data.title !== "string" ||
      !data.title.trim() ||
      !("tasks" in data) ||
      !Array.isArray(data.tasks)
    )
      return null;
    if ("version" in data && data.version !== 1) return null;
    const tasks: Task[] = [];
    for (const task of data.tasks) {
      const lane = taskLanes.find(({ id }) => id === task?.status);
      if (!lane || typeof task.text !== "string" || !task.text.trim())
        return null;
      const priority = taskPriorities.find(
        ({ id }) => id === task.priority,
      )?.id;
      if (task.priority !== undefined && priority === undefined) return null;
      if (task.dueDate !== undefined && !isTaskDueDate(task.dueDate))
        return null;
      tasks.push({ ...task, text: task.text, status: lane.id, priority });
    }
    return { ...data, title: data.title, tasks };
  } catch {
    return null;
  }
}

export function taskBoardMarkdown(board: TaskBoard): string {
  return `\`\`\`${TASK_BOARD_LANGUAGE}\n${JSON.stringify(board, null, 2)}\n\`\`\``;
}

export function taskBoardBlocks(tree: ReturnType<typeof markdownParser.parse>) {
  return tree.children.flatMap((node) => {
    if (node.type !== "code" || node.lang !== TASK_BOARD_LANGUAGE) return [];
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    return from === undefined || to === undefined
      ? []
      : [{ from, to, board: readTaskBoard(node.value) }];
  });
}

export function appendTaskTemplate(source: string, template: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const block = template.replaceAll("\n", newline);
  const blankLine = newline.repeat(2);
  const beforeBlock = (prefix: string) => {
    if (!prefix || prefix.endsWith(blankLine)) return prefix;
    return prefix.endsWith(newline) ? prefix + newline : prefix + blankLine;
  };
  const prefix = beforeBlock(source);
  const appended = prefix + block + newline;
  // CommonMark permits unclosed fences and HTML blocks at EOF. Keep the
  // existing text intact and insert before a block that would swallow the template.
  const enclosing = markdownParser.parse(appended).children.find((node) => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    return (
      from !== undefined &&
      to !== undefined &&
      from < prefix.length &&
      to > prefix.length
    );
  });
  const start = enclosing?.position?.start.offset;
  if (start === undefined) return appended;
  const lineStart = start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;
  return (
    beforeBlock(source.slice(0, lineStart)) +
    block +
    blankLine +
    source.slice(lineStart)
  );
}

export const taskTemplates = {
  todo: "## TODO リスト\n\n- [x] 要件を整理する\n- [ ] 下書きを作成する\n- [ ] レビューを依頼する",
  kanban: taskBoardMarkdown({
    version: 1,
    title: "リリース準備",
    tasks: [
      { text: "リリースノートを書く", status: "todo" },
      { text: "告知文を作る", status: "todo" },
      { text: "プレビューを確認する", status: "doing" },
      { text: "公開範囲を決める", status: "done" },
    ],
  }),
};
