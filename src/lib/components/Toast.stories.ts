import type { Meta, StoryObj } from "@storybook/svelte-vite";
import Toast from "./Toast.svelte";

const meta = {
  title: "Components/Toast",
  component: Toast,
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { message: "文書を保存しました" } };

export const SaveError: Story = {
  args: { message: "文書を保存できませんでした", tone: "error" },
};
