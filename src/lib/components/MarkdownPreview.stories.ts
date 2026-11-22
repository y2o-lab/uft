import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, fn } from "storybook/test";
import MarkdownPreview from "./MarkdownPreview.svelte";

const meta = {
  title: "Components/MarkdownPreview",
  component: MarkdownPreview,
  args: {
    markdown:
      "# リリース\n\n- [x] 下書きを作成\n- [ ] レビューを依頼\n\n> 変更点を **太字** で記録します。",
    documentKey: "release-notes",
    onChange: fn(),
  },
} satisfies Meta<typeof MarkdownPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {};

export const Editing: Story = {
  args: { canEdit: true },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "プレビューを編集" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "編集可能な Markdown プレビュー" }),
    ).toBeVisible();
  },
};
