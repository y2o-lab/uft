import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
} from "@xyflow/svelte";
import type { DiagramDocument, DiagramGraph } from "../domain/workspace";
import { getAwsService } from "./aws-icons";

export function validateGraph(graph: unknown): graph is DiagramGraph {
  if (!graph || typeof graph !== "object") return false;
  const candidate = graph as Partial<DiagramGraph>;
  if (
    candidate.formatVersion !== 1 ||
    !Array.isArray(candidate.nodes) ||
    !Array.isArray(candidate.edges) ||
    !candidate.viewport ||
    !Number.isFinite(candidate.viewport.x) ||
    !Number.isFinite(candidate.viewport.y) ||
    !Number.isFinite(candidate.viewport.zoom) ||
    candidate.viewport.zoom <= 0
  )
    return false;
  const nodeIds = new Set<string>();
  for (const node of candidate.nodes) {
    if (
      !node ||
      typeof node.id !== "string" ||
      !node.id ||
      nodeIds.has(node.id) ||
      !node.position ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.y) ||
      !node.data ||
      typeof node.data.label !== "string" ||
      (node.data.kind !== undefined &&
        ![
          "process",
          "decision",
          "terminator",
          "database",
          "component",
          "queue",
          "note",
          "aws-service",
        ].includes(String(node.data.kind))) ||
      (node.data.awsService !== undefined &&
        typeof node.data.awsService !== "string")
    )
      return false;
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of candidate.edges) {
    if (
      !edge ||
      typeof edge.id !== "string" ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string" ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      (edge.sourceHandle !== undefined &&
        edge.sourceHandle !== null &&
        !["top", "right", "bottom", "left"].includes(edge.sourceHandle)) ||
      (edge.targetHandle !== undefined &&
        edge.targetHandle !== null &&
        !["top", "right", "bottom", "left"].includes(edge.targetHandle)) ||
      (edge.data?.direction !== undefined &&
        !["forward", "both", "none"].includes(edge.data.direction)) ||
      (edge.data?.lineStyle !== undefined &&
        !["solid", "dashed"].includes(edge.data.lineStyle))
    )
      return false;
    edgeIds.add(edge.id);
  }
  return true;
}

export function validateDiagramDocument(
  diagram: unknown,
): diagram is DiagramDocument {
  if (!diagram || typeof diagram !== "object") return false;
  const candidate = diagram as Partial<DiagramDocument>;
  return (
    candidate.formatVersion === 1 &&
    typeof candidate.entryId === "string" &&
    Boolean(candidate.entryId) &&
    validateGraph(candidate.graph) &&
    (candidate.previewAssetId === null ||
      typeof candidate.previewAssetId === "string") &&
    (candidate.mermaidSource === null ||
      typeof candidate.mermaidSource === "string") &&
    typeof candidate.updatedAt === "string" &&
    Boolean(candidate.updatedAt)
  );
}

export function graphToMermaid(graph: DiagramGraph): {
  source?: string;
  reason?: string;
} {
  if (
    graph.nodes.some(
      (node) => node.type && !["default", "diagram"].includes(node.type),
    )
  )
    return {
      reason: "未対応のカスタムノードは Mermaid に変換できません。",
    };
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (
    graph.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))
  )
    return { reason: "接続先のないエッジが含まれています。" };
  const nodes = graph.nodes.map((node) => mermaidNode(node));
  const edges = graph.edges.map((edge) => {
    const direction = edge.data?.direction ?? "forward";
    const dashed = edge.data?.lineStyle === "dashed";
    const connector = dashed
      ? direction === "none"
        ? "-.-"
        : direction === "both"
          ? "<-.->"
          : "-.->"
      : direction === "none"
        ? "---"
        : direction === "both"
          ? "<-->"
          : "-->";
    const label = edge.label
      ? `|${String(edge.label).replace(/[|\n\r]/g, " ")}|`
      : "";
    return `${safeId(edge.source)} ${connector}${label} ${safeId(edge.target)}`;
  });
  return { source: ["flowchart LR", ...nodes, ...edges].join("\n") };
}

export function graphToSvg(graph: DiagramGraph): string {
  const padding = 40;
  const minX = Math.min(0, ...graph.nodes.map((node) => node.position.x));
  const minY = Math.min(0, ...graph.nodes.map((node) => node.position.y));
  const maxX = Math.max(
    600,
    ...graph.nodes.map((node) => node.position.x + nodeSize(node).width),
  );
  const maxY = Math.max(
    320,
    ...graph.nodes.map((node) => node.position.y + nodeSize(node).height),
  );
  const viewX = minX - padding;
  const viewY = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return "";
      const sourceSide = edge.sourceHandle ?? bestSide(source, target, true);
      const targetSide = edge.targetHandle ?? bestSide(source, target, false);
      const sourcePoint = anchor(source, sourceSide);
      const targetPoint = anchor(target, targetSide);
      const [path, labelX, labelY] = edgePath(
        edge.type,
        sourcePoint,
        targetPoint,
        sidePosition(sourceSide),
        sidePosition(targetSide),
      );
      const direction = edge.data?.direction ?? "forward";
      const markers = `${direction === "both" ? ' marker-start="url(#arrow-start)"' : ""}${direction === "none" ? "" : ' marker-end="url(#arrow-end)"'}`;
      const dash =
        edge.data?.lineStyle === "dashed" ? ' stroke-dasharray="7 5"' : "";
      const label = edge.label
        ? `<text x="${labelX}" y="${labelY - 7}" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="600" fill="#405243" stroke="#fffefa" stroke-width="5" paint-order="stroke">${escapeXml(String(edge.label))}</text>`
        : "";
      return `<g><path d="${path}" fill="none" stroke="#607d63" stroke-width="2"${dash}${markers}/>${label}</g>`;
    })
    .join("");
  const nodes = graph.nodes.map(svgNode).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${width} ${height}" role="img" aria-label="Diagram"><defs><marker id="arrow-end" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#607d63"/></marker><marker id="arrow-start" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto"><path d="M9,0 L9,6 L0,3 z" fill="#607d63"/></marker></defs><rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="#fffefa"/>${edges}${nodes}</svg>`;
}

type Side = "top" | "right" | "bottom" | "left";
type DiagramNode = DiagramGraph["nodes"][number];

function nodeSize(node: DiagramNode): { width: number; height: number } {
  switch (node.data.kind) {
    case "decision":
      return { width: 164, height: 112 };
    case "aws-service":
      return { width: 184, height: 104 };
    case "database":
      return { width: 180, height: 88 };
    case "terminator":
      return { width: 180, height: 64 };
    default:
      return { width: 180, height: 72 };
  }
}

function center(node: DiagramNode): { x: number; y: number } {
  const size = nodeSize(node);
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

function bestSide(
  source: DiagramNode,
  target: DiagramNode,
  fromSource: boolean,
): Side {
  const a = center(source);
  const b = center(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (fromSource) return dx >= 0 ? "right" : "left";
    return dx >= 0 ? "left" : "right";
  }
  if (fromSource) return dy >= 0 ? "bottom" : "top";
  return dy >= 0 ? "top" : "bottom";
}

function anchor(node: DiagramNode, side: string): { x: number; y: number } {
  const size = nodeSize(node);
  const x = node.position.x;
  const y = node.position.y;
  if (side === "top") return { x: x + size.width / 2, y };
  if (side === "bottom") return { x: x + size.width / 2, y: y + size.height };
  if (side === "left") return { x, y: y + size.height / 2 };
  return { x: x + size.width, y: y + size.height / 2 };
}

function sidePosition(side: string): Position {
  if (side === "top") return Position.Top;
  if (side === "bottom") return Position.Bottom;
  if (side === "left") return Position.Left;
  return Position.Right;
}

function edgePath(
  type: string | undefined,
  source: { x: number; y: number },
  target: { x: number; y: number },
  sourcePosition: Position,
  targetPosition: Position,
): [string, number, number, number, number] {
  const params = {
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition,
    targetPosition,
  };
  if (type === "straight") return getStraightPath(params);
  if (type === "step") return getSmoothStepPath({ ...params, borderRadius: 0 });
  if (type === "smoothstep") return getSmoothStepPath(params);
  return getBezierPath(params);
}

function svgNode(node: DiagramNode): string {
  const { x, y } = node.position;
  const { width, height } = nodeSize(node);
  const label = escapeXml(String(node.data.label));
  const common = 'fill="#f7faf5" stroke="#527154" stroke-width="1.5"';
  if (node.data.kind === "decision") {
    return `<g><polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" ${common}/>${svgText(label, x + width / 2, y + height / 2)}</g>`;
  }
  if (node.data.kind === "database") {
    return `<g><path d="M ${x} ${y + 12} C ${x} ${y - 3}, ${x + width} ${y - 3}, ${x + width} ${y + 12} L ${x + width} ${y + height - 12} C ${x + width} ${y + height + 3}, ${x} ${y + height + 3}, ${x} ${y + height - 12} Z" ${common}/><ellipse cx="${x + width / 2}" cy="${y + 12}" rx="${width / 2}" ry="12" fill="#e7f0e4" stroke="#527154" stroke-width="1.5"/>${svgText(label, x + width / 2, y + height / 2 + 5)}</g>`;
  }
  if (node.data.kind === "note") {
    return `<g><path d="M ${x} ${y} H ${x + width - 22} L ${x + width} ${y + 22} V ${y + height} H ${x} Z" fill="#fff8cf" stroke="#8f7b39" stroke-width="1.5"/><path d="M ${x + width - 22} ${y} V ${y + 22} H ${x + width}" fill="none" stroke="#8f7b39"/>${svgText(label, x + width / 2, y + height / 2 + 3)}</g>`;
  }
  if (node.data.kind === "aws-service") {
    const icon = getAwsService(String(node.data.awsService ?? ""))?.svg;
    const inner = icon?.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1] ?? "";
    const iconSvg = inner
      ? `<svg x="${x + width / 2 - 26}" y="${y + 10}" width="52" height="52" viewBox="0 0 64 64">${inner}</svg>`
      : "";
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#fff" stroke="#8797a5" stroke-width="1.5"/>${iconSvg}<text x="${x + width / 2}" y="${y + 86}" text-anchor="middle" font-family="system-ui" font-size="13" font-weight="600" fill="#253746">${label}</text></g>`;
  }
  const rx = node.data.kind === "terminator" ? height / 2 : 9;
  const fill = node.data.kind === "queue" ? "#f5ecff" : "#edf4ea";
  return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" stroke="#527154" stroke-width="1.5"/>${node.data.kind === "component" ? `<path d="M ${x + 12} ${y + 16} h 18 v 13 h -18 M ${x + 12} ${y + 43} h 18 v 13 h -18" fill="#fff" stroke="#527154"/>` : ""}${svgText(label, x + width / 2, y + height / 2 + 4)}</g>`;
}

function svgText(label: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="system-ui" font-size="14" font-weight="600" fill="#2f4a34">${label}</text>`;
}

function mermaidNode(node: DiagramNode): string {
  const id = safeId(node.id);
  const label = String(node.data.label).replace(/["\n\r]/g, " ");
  if (node.data.kind === "decision") return `${id}{"${label}"}`;
  if (node.data.kind === "terminator") return `${id}(["${label}"])`;
  if (node.data.kind === "database") return `${id}[("${label}")]`;
  return `${id}["${label}"]`;
}

function safeId(id: string): string {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}
function escapeXml(value: string): string {
  return value.replace(
    /[<>&"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character] ??
      character,
  );
}
