import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, fn } from "storybook/test";
import type { MarkdownFormat } from "../markdown/formatting";
import MarkdownFormattingToolbar from "./MarkdownFormattingToolbar.svelte";

const meta = {
  title: "Components/MarkdownFormattingToolbar",
  component: MarkdownFormattingToolbar,
  args: { onFormat: fn() },
  argTypes: { active: { control: false } },
} satisfies Meta<typeof MarkdownFormattingToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveFormat: Story = {
  args: { active: new Set<MarkdownFormat>(["bold"]) },
  play: async ({ args, canvas, userEvent }) => {
    const bold = canvas.getByRole("button", { name: "太字" });
    await expect(bold).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "斜体" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(bold);
    await expect(args.onFormat).toHaveBeenCalledTimes(1);
    await expect(args.onFormat).toHaveBeenCalledWith("bold");
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const bold = canvas.getByRole("button", { name: "太字" });
    await expect(bold).toBeDisabled();
    await userEvent.click(bold);
    await expect(args.onFormat).not.toHaveBeenCalled();
  },
};
