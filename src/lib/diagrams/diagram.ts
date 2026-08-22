import type { DiagramGraph } from "../domain/workspace";

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
      typeof node.data.label !== "string"
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
      !nodeIds.has(edge.target)
    )
      return false;
    edgeIds.add(edge.id);
  }
  return true;
}

export function graphToMermaid(graph: DiagramGraph): {
  source?: string;
  reason?: string;
} {
  if (
    graph.nodes.some((node) => node.type && node.type !== "default") ||
    graph.edges.some((edge) => edge.type && edge.type !== "default")
  )
    return {
      reason: "カスタムノードまたはエッジは Mermaid に変換できません。",
    };
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (
    graph.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))
  )
    return { reason: "接続先のないエッジが含まれています。" };
  const nodes = graph.nodes.map(
    (node) =>
      `${safeId(node.id)}[${String(node.data.label).replace(/[[\]]/g, "")}]`,
  );
  const edges = graph.edges.map(
    (edge) =>
      `${safeId(edge.source)} -->${edge.label ? `|${edge.label}|` : ""} ${safeId(edge.target)}`,
  );
  return { source: ["flowchart LR", ...nodes, ...edges].join("\n") };
}

export function graphToSvg(graph: DiagramGraph): string {
  const padding = 40;
  const minX = Math.min(0, ...graph.nodes.map((node) => node.position.x));
  const minY = Math.min(0, ...graph.nodes.map((node) => node.position.y));
  const maxX = Math.max(
    600,
    ...graph.nodes.map((node) => node.position.x + 170),
  );
  const maxY = Math.max(
    320,
    ...graph.nodes.map((node) => node.position.y + 54),
  );
  const viewX = minX - padding;
  const viewY = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const nodes = graph.nodes
    .map(
      (node) =>
        `<g><rect x="${node.position.x}" y="${node.position.y}" width="170" height="54" rx="8" fill="#edf4ea" stroke="#527154"/><text x="${node.position.x + 85}" y="${node.position.y + 32}" text-anchor="middle" font-family="system-ui" font-size="14" fill="#2f4a34">${escapeXml(String(node.data.label))}</text></g>`,
    )
    .join("");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return "";
      return `<path d="M ${source.position.x + 170} ${source.position.y + 27} L ${target.position.x} ${target.position.y + 27}" fill="none" stroke="#607d63" stroke-width="2" marker-end="url(#arrow)"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${width} ${height}" role="img" aria-label="Diagram"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#607d63"/></marker></defs><rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="#fffefa"/>${edges}${nodes}</svg>`;
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
