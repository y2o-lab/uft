import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import CodeMirrorEditor from "./CodeMirrorEditor.svelte";

const meta = {
  title: "Components/CodeMirrorEditor",
  component: CodeMirrorEditor,
  args: {
    documentKey: "overview",
    value: "# Overview\n\n- [x] Draft scope\n- [ ] Review changes",
    onChange: fn(),
  },
} satisfies Meta<typeof CodeMirrorEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const ReadOnly: Story = { args: { readOnly: true } };
