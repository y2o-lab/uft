import type { Meta, StoryObj } from "@storybook/svelte-vite";
import DiagramNodeCanvas from "../../../.storybook/fixtures/DiagramNodeCanvas.svelte";

const meta = {
  title: "Components/DiagramNode",
  component: DiagramNodeCanvas,
} satisfies Meta<typeof DiagramNodeCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Process: Story = {
  args: { data: { kind: "process", label: "文書を変換" } },
};

export const AwsService: Story = {
  args: {
    data: { kind: "aws-service", awsService: "aws-lambda", label: "変換処理" },
  },
};
