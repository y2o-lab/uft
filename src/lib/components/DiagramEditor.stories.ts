import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { fn } from "storybook/test";
import { createDiagramTemplate } from "../diagrams/templates";
import type { DiagramDocument } from "../domain/workspace";
import DiagramEditor from "./DiagramEditor.svelte";

const emptyDiagram: DiagramDocument = {
  entryId: "diagram-example",
  formatVersion: 1,
  graph: {
    formatVersion: 1,
    nodes: [],
    edges: [],
    viewport: { x: 40, y: 20, zoom: 0.75 },
  },
  previewAssetId: null,
  mermaidSource: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const meta = {
  title: "Components/DiagramEditor",
  component: DiagramEditor,
  args: { diagram: emptyDiagram, onChange: fn() },
} satisfies Meta<typeof DiagramEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyCanvas: Story = {};

export const FlowTemplate: Story = {
  args: {
    diagram: {
      ...emptyDiagram,
      graph: { ...emptyDiagram.graph, ...createDiagramTemplate("flow") },
    },
  },
};
