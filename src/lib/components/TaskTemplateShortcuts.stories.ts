import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, fn } from "storybook/test";
import { appendTaskTemplate, taskTemplates } from "../markdown/task-board";
import TaskTemplateShortcuts from "./TaskTemplateShortcuts.svelte";

const content = "# リリース準備";
const meta = {
  title: "Components/TaskTemplateShortcuts",
  component: TaskTemplateShortcuts,
  args: { content, onInsert: fn() },
} satisfies Meta<typeof TaskTemplateShortcuts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InsertTodo: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "TODO リストを挿入" }),
    );
    await expect(args.onInsert).toHaveBeenCalledWith(
      appendTaskTemplate(content, taskTemplates.todo),
    );
  },
};

export const InsertKanban: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "カンバンを挿入" }),
    );
    await expect(args.onInsert).toHaveBeenCalledWith(
      appendTaskTemplate(content, taskTemplates.kanban),
    );
  },
};
