import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import ToolLauncher from "./ToolLauncher.svelte";

const meta = {
  title: "Components/ToolLauncher",
  component: ToolLauncher,
  args: { open: true },
} satisfies Meta<typeof ToolLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Filtered: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole("textbox"),
      "Markdown ワークスペース",
    );
    await expect(
      canvas.getByText("Markdown ワークスペース", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.queryByText("IP Toolkit", { exact: true }),
    ).not.toBeInTheDocument();
  },
};
