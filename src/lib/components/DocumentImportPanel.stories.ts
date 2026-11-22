import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import { defaultWorkspace } from "../domain/workspace";
import DocumentImportPanel from "./DocumentImportPanel.svelte";

const meta = {
  title: "Components/DocumentImportPanel",
  component: DocumentImportPanel,
  args: {
    workspace: null,
    canWrite: false,
    saveNow: fn(async () => true),
    onStatus: fn(),
    onOpenDocument: fn(),
    onError: fn(),
  },
} satisfies Meta<typeof DocumentImportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToImport: Story = {
  args: { canWrite: true },
  render: (args) => ({
    Component: DocumentImportPanel,
    props: { ...args, workspace: structuredClone(defaultWorkspace) },
  }),
};

export const WorkspaceLoading: Story = {};
