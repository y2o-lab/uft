import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { expect } from "storybook/test";
import { mountAtRoute } from "../.storybook/fixtures/route";
import App from "./App.svelte";

const meta = {
  title: "App/App",
  component: App,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IpToolkit: Story = {
  play: async ({ mount }) => {
    const canvas = await mountAtRoute("/ip-toolkit", mount);
    await expect(
      canvas.getByRole("heading", { name: "IP Toolkit" }),
    ).toBeVisible();
  },
};
