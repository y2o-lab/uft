import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import type { TaskBoard as Board } from "../markdown/task-board";
import TaskBoard from "./TaskBoard.svelte";

const initialBoard: Board = {
  title: "リリース準備",
  tasks: [
    { text: "変更履歴を更新", status: "todo", priority: "high" },
    { text: "動作確認", status: "doing", priority: "medium" },
    { text: "仕様を整理", status: "done" },
  ],
};

const meta = {
  title: "Components/TaskBoard",
  component: TaskBoard,
  args: { initialBoard, canEdit: true, onChange: fn(() => true) },
} satisfies Meta<typeof TaskBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyBoard: Story = {
  args: { initialBoard: { title: "リリース準備", tasks: [] } },
};

export const ReadOnlyBoard: Story = { args: { canEdit: false } };

export const EditableBoard: Story = {};
