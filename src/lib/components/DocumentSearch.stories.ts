import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import DocumentSearchPreview from "../../../.storybook/fixtures/DocumentSearchPreview.svelte";

const meta = {
  title: "Components/DocumentSearch",
  component: DocumentSearchPreview,
  args: { text: "Markdown メモと Markdown プレビュー" },
} satisfies Meta<typeof DocumentSearchPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MatchesFound: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "プレビュー内を検索" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "プレビュー内の検索語" }),
      "Markdown",
    );
    await expect(
      canvas.getByRole("button", { name: "次の一致" }),
    ).toBeEnabled();
  },
};

export const NoMatches: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "プレビュー内を検索" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "プレビュー内の検索語" }),
      "Storybook",
    );
    await expect(
      canvas.getByRole("button", { name: "次の一致" }),
    ).toBeDisabled();
  },
};
