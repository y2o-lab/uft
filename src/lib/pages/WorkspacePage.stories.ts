import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect, waitFor } from "storybook/test";
import { mountAtRoute } from "../../../.storybook/fixtures/route";
import WorkspacePage from "./WorkspacePage.svelte";

const meta = {
  title: "Pages/WorkspacePage",
  component: WorkspacePage,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WorkspacePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MarkdownWorkspace: Story = {
  play: async ({ mount }) => {
    const canvas = await mountAtRoute("/workspace", mount);
    await expect(
      await canvas.findByRole("button", { name: "ワークスペースのルート" }),
    ).toBeEnabled();
  },
};

export const DocumentImport: Story = {
  play: async ({ mount }) => {
    const canvas = await mountAtRoute("/convert-to-markdown", mount);
    await expect(
      canvas.getByRole("heading", { name: "文書を Markdown に変換" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "複数の文書を選択" }),
      ).toBeEnabled(),
    );
  },
};
