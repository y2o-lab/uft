import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../domain/workspace";
import { emptyDiagram } from "../workspace/workspace-service";
import {
  graphToMermaid,
  graphToSvg,
  validateDiagramDocument,
  validateGraph,
} from "./diagram";
import { createDiagramTemplate } from "./templates";

describe("diagram transfer", () => {
  it("validates and exports a supported flow", () => {
    const graph = emptyDiagram("diagram").graph;
    expect(validateGraph(graph)).toBe(true);
    expect(graphToMermaid(graph).source).toContain("flowchart LR");
    expect(graphToSvg(graph)).toContain("<svg");
    expect(defaultWorkspace.id).toBe("default");
  });

  it("rejects malformed graph data before it reaches the editor", () => {
    expect(
      validateGraph({
        formatVersion: 1,
        nodes: [
          {
            id: "node",
            position: { x: Number.NaN, y: 0 },
            data: { label: "Broken" },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toBe(false);
    expect(
      validateGraph({
        formatVersion: 1,
        nodes: [],
        edges: [{ id: "broken", source: "missing", target: "missing" }],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ).toBe(false);
    expect(
      validateDiagramDocument({
        entryId: "diagram",
        formatVersion: 1,
        graph: emptyDiagram("diagram").graph,
        previewAssetId: null,
        mermaidSource: null,
      }),
    ).toBe(false);
  });

  it("keeps nodes dragged above or left of the origin inside an SVG export", () => {
    const graph = emptyDiagram("diagram").graph;
    graph.nodes[0] = {
      ...graph.nodes[0],
      position: { x: -120, y: -80 },
    };

    expect(graphToSvg(graph)).toContain('viewBox="-160 -120');
  });

  it("exports multi-directional, labelled and styled connections", () => {
    const graph = emptyDiagram("diagram").graph;
    graph.nodes = createDiagramTemplate("flow").nodes;
    graph.edges = [
      {
        id: "bidirectional",
        source: "review",
        target: "rework",
        sourceHandle: "bottom",
        targetHandle: "left",
        type: "smoothstep",
        label: "iterate",
        data: { direction: "both", lineStyle: "dashed" },
      },
    ];

    expect(validateGraph(graph)).toBe(true);
    const svg = graphToSvg(graph);
    expect(svg).toContain('marker-start="url(#arrow-start)"');
    expect(svg).toContain('marker-end="url(#arrow-end)"');
    expect(svg).toContain('stroke-dasharray="7 5"');
    expect(svg).toContain(">iterate</text>");
    expect(graphToMermaid(graph).source).toContain("<-.->|iterate|");
  });

  it("embeds current AWS architecture icon SVGs in the portable export", () => {
    const graph = emptyDiagram("diagram").graph;
    const template = createDiagramTemplate("aws-web");
    graph.nodes = template.nodes;
    graph.edges = template.edges;

    expect(validateGraph(graph)).toBe(true);
    const svg = graphToSvg(graph);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain("#ed7100");
    expect(svg).toContain(">Application</text>");
  });

  it("rejects unsupported handles and edge presentation values", () => {
    const graph = emptyDiagram("diagram").graph;
    graph.edges[0] = {
      ...graph.edges[0],
      sourceHandle: "diagonal",
      data: { direction: "sideways" as never, lineStyle: "solid" },
    };
    expect(validateGraph(graph)).toBe(false);
  });
});
