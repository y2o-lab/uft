import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, fn } from "storybook/test";
import TextInputDialog from "./TextInputDialog.svelte";

const meta = {
  title: "Components/TextInputDialog",
  component: TextInputDialog,
  args: { open: true, onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof TextInputDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const renameDocumentArgs = {
  title: "文書の名前を変更",
  label: "文書名",
  value: "overview.md",
  submitLabel: "名前変更",
};

export const RenameDocument: Story = {
  args: renameDocumentArgs,
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "文書名" });
    await userEvent.clear(input);
    await userEvent.type(input, "  release-notes.md  {Enter}");
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith("release-notes.md");
  },
};

export const BlankDocumentName: Story = {
  args: renameDocumentArgs,
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "文書名" });
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");
    await expect(
      canvas.getByRole("button", { name: "名前変更" }),
    ).toBeDisabled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const SelectWorkspace: Story = {
  args: {
    title: "ワークスペースを開く",
    label: "ワークスペース",
    options: [
      { label: "My workspace", value: "default" },
      { label: "チームの文書", value: "team" },
    ],
    value: "default",
    submitLabel: "開く",
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "ワークスペース" }),
      canvas.getByRole("option", { name: "チームの文書" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "開く" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith("team");
  },
};
