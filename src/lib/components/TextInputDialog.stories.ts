import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import TextInputDialog from "./TextInputDialog.svelte";

const meta = {
  title: "Components/TextInputDialog",
  component: TextInputDialog,
  args: { open: true, onSubmit: fn(), onCancel: fn() },
} satisfies Meta<typeof TextInputDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RenameDocument: Story = {
  args: {
    title: "文書の名前を変更",
    label: "文書名",
    value: "overview.md",
    submitLabel: "名前変更",
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
};
