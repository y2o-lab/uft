import { describe, expect, it } from "vitest";
import { renderMarkdownPreview } from "./preview";
import {
  appendTaskTemplate,
  readTaskBoard,
  taskBoardMarkdown,
  taskTemplates,
} from "./task-board";

describe("embedded task boards", () => {
  it("round-trips legacy boards and preserves extension fields", async () => {
    const input = {
      title: "Release",
      owner: "team",
      tasks: [
        { text: "Write notes\n```", status: "todo", tags: ["docs"] },
        { text: "Publish", status: "doing", dueDate: "2028-02-29" },
      ],
    };
    const board = readTaskBoard(JSON.stringify(input));
    expect(board).toEqual(input);
    if (!board) throw new Error("Legacy board could not be parsed");
    const { taskBoards } = await renderMarkdownPreview(
      taskBoardMarkdown(board),
    );
    expect(taskBoards.map(({ board }) => board)).toEqual([input]);
  });

  it("keeps unsupported versions and invalid dates available as source", async () => {
    const invalid = [
      { version: 2, title: "Future board", tasks: [] },
      {
        title: "Invalid date",
        tasks: [{ text: "Task", status: "todo", dueDate: "2026-02-29" }],
      },
    ];
    const source = invalid
      .map((board) => `\`\`\`uft-kanban\n${JSON.stringify(board)}\n\`\`\``)
      .join("\n\n");
    const preview = await renderMarkdownPreview(source);
    expect(preview.taskBoards.map(({ board }) => board)).toEqual([null, null]);
    expect(preview.html).toContain("Future board");
    expect(preview.html).toContain("2026-02-29");
  });

  it.each(["  ~~~js\r\nexample", "<!-- unfinished"])(
    "keeps a template out of an unclosed block",
    async (unfinished) => {
      const newline = unfinished.includes("\r\n") ? "\r\n" : "\n";
      const start = `# Plan${newline.repeat(2)}`;
      const updated = appendTaskTemplate(
        start + unfinished,
        taskTemplates.kanban,
      );
      expect(updated.startsWith(start)).toBe(true);
      expect(updated.endsWith(unfinished)).toBe(true);
      const { taskBoards } = await renderMarkdownPreview(updated);
      expect(taskBoards[0]?.board?.title).toBe("リリース準備");
    },
  );

  it("appends after a closed code block without changing its bytes", () => {
    const source = "```text\nexample\n```\n";
    expect(appendTaskTemplate(source, taskTemplates.todo)).toBe(
      `${source}\n${taskTemplates.todo}\n`,
    );
  });
});
