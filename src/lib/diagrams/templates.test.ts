import { describe, expect, it } from "vitest";
import { AWS_SERVICES } from "./aws-icons";
import { createDiagramTemplate, DIAGRAM_TEMPLATES } from "./templates";

describe("diagram templates", () => {
  it("offers flow, generic architecture and AWS architecture starting points", () => {
    expect(DIAGRAM_TEMPLATES.map((template) => template.id)).toEqual([
      "flow",
      "architecture",
      "aws-web",
      "aws-serverless",
      "er",
    ]);
  });

  it("includes a branching flow with a return path", () => {
    const graph = createDiagramTemplate("flow");
    expect(graph.nodes.some((node) => node.data.kind === "decision")).toBe(
      true,
    );
    expect(
      graph.edges.some(
        (edge) => edge.source === "rework" && edge.target === "review",
      ),
    ).toBe(true);
    expect(graph.edges.some((edge) => edge.sourceHandle === "bottom")).toBe(
      true,
    );
  });

  it("uses only supported official AWS service icon ids", () => {
    const known = new Set(AWS_SERVICES.map((service) => service.id));
    for (const templateId of ["aws-web", "aws-serverless"]) {
      const graph = createDiagramTemplate(templateId);
      const awsNodes = graph.nodes.filter(
        (node) => node.data.kind === "aws-service",
      );
      expect(awsNodes.length).toBeGreaterThan(0);
      expect(
        awsNodes.every((node) => known.has(node.data.awsService as never)),
      ).toBe(true);
    }
  });
});
