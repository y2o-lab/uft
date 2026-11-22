import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
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
};

export const Disabled: Story = { args: { disabled: true } };
