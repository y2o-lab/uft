import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import ConfirmDialog from "./ConfirmDialog.svelte";

const meta = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  args: { onConfirm: fn(), onCancel: fn() },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeleteDocument: Story = {
  args: {
    open: true,
    title: "文書を削除",
    detail: "overview.md をゴミ箱へ移動します。",
  },
};
