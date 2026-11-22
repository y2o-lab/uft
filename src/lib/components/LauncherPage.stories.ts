import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import LauncherPage from "./LauncherPage.svelte";

const meta = {
  title: "Components/LauncherPage",
  component: LauncherPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LauncherPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvailableTools: Story = {};

export const NoResults: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox"), "存在しないツール");
    await expect(canvas.getByText(/一致するツールはありません/)).toBeVisible();
  },
};
