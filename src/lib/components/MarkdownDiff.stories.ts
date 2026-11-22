import type { Meta, StoryObj } from "@storybook/svelte-vite";
import MarkdownDiff from "./MarkdownDiff.svelte";

const before = "# リリース\n\n- README を更新する\n- テストを実行する";
const meta = {
  title: "Components/MarkdownDiff",
  component: MarkdownDiff,
  args: { before },
} satisfies Meta<typeof MarkdownDiff>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChangedLines: Story = {
  args: { after: "# リリース\n\n- 変更履歴を更新する\n- テストを実行する" },
};

export const Unchanged: Story = { args: { after: before } };
