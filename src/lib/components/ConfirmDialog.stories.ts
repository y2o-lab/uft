import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, fn } from "storybook/test";
import ConfirmDialog from "./ConfirmDialog.svelte";

const meta = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialog,
  args: { onConfirm: fn(), onCancel: fn() },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const deleteDocumentArgs = {
  open: true,
  title: "文書を削除",
  detail: "overview.md をゴミ箱へ移動します。",
};

export const DeleteDocument: Story = {
  args: deleteDocumentArgs,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "削除" }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

export const CancelDelete: Story = {
  args: deleteDocumentArgs,
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "キャンセル" }));
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

export const CancelDeleteWithEscape: Story = {
  args: deleteDocumentArgs,
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: "キャンセル" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};
