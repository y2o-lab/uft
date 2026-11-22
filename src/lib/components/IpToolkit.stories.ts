import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import IpToolkit from "./IpToolkit.svelte";

const meta = {
  title: "Components/IpToolkit",
  component: IpToolkit,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof IpToolkit>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lookup: Story = {};

export const CidrCalculator: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Network" }));
    await userEvent.click(canvas.getByRole("button", { name: "Calculate" }));
    await expect(canvas.getByText(/192\.168\.1\.0/)).toBeVisible();
  },
};
