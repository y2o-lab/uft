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
});
