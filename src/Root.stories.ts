import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import { mountAtRoute } from "../.storybook/fixtures/route";
import Root from "./Root.svelte";

const meta = {
  title: "App/Root",
  component: Root,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {
  play: async ({ mount }) => {
    const canvas = await mountAtRoute("/", mount);
    await expect(
      canvas.getByRole("heading", { name: "作業を始めるツールを選択" }),
    ).toBeVisible();
  },
};

export const UnexpectedError: Story = {
  play: async ({ canvasElement, mount }) => {
    const canvas = await mountAtRoute("/", mount);
    const previewWindow = canvasElement.ownerDocument.defaultView;
    previewWindow?.dispatchEvent(
      new ErrorEvent("error", {
        cancelable: true,
        message: "Storybook example",
      }),
    );
    await expect(
      await canvas.findByRole("heading", { name: "問題が発生しました" }),
    ).toBeVisible();
  },
};
