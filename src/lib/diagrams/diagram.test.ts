import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "../domain/workspace";
import { emptyDiagram } from "../workspace/workspace-service";
import { graphToMermaid, graphToSvg, validateGraph } from "./diagram";

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
  });

  it("keeps nodes dragged above or left of the origin inside an SVG export", () => {
    const graph = emptyDiagram("diagram").graph;
    graph.nodes[0] = {
      ...graph.nodes[0],
      position: { x: -120, y: -80 },
    };

    expect(graphToSvg(graph)).toContain('viewBox="-160 -120');
  });
});
