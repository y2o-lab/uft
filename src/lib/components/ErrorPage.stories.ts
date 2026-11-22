import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import ErrorPage from "./ErrorPage.svelte";

const meta = {
  title: "Components/ErrorPage",
  component: ErrorPage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ErrorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotFound: Story = {
  args: {
    code: "404",
    title: "ページが見つかりません",
    description:
      "URLをご確認のうえ、ホームから目的のツールを選択してください。",
    onOpenLauncher: fn(),
  },
};

export const RetryableError: Story = {
  args: {
    code: "UNEXPECTED ERROR",
    title: "問題が発生しました",
    description:
      "画面を表示できませんでした。もう一度試すか、ホームへ戻ってください。",
    actionLabel: "もう一度試す",
    onAction: fn(),
  },
};
