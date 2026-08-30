<script lang="ts">
  import "@xyflow/svelte/dist/style.css";
  import { Background, Controls, SvelteFlow, addEdge, type Connection, type Edge, type Node } from "@xyflow/svelte";
  import type { DiagramDocument } from "../domain/workspace";
  let { diagram, onChange }: { diagram: DiagramDocument; onChange: (diagram: DiagramDocument) => void } = $props();
let nodes = $state<Node[]>([]);
let edges = $state<Edge[]>([]);
let label = $state("");
let loadedDiagramId = "";
let lastReportedGraph = "";

function graphSnapshot(): string {
  return JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { label: String(node.data.label ?? "") },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ? String(edge.label) : undefined,
      type: edge.type,
    })),
  });
}

$effect(() => {
  if (loadedDiagramId === diagram.entryId) return;
  loadedDiagramId = diagram.entryId;
  nodes = diagram.graph.nodes;
  edges = diagram.graph.edges;
  lastReportedGraph = graphSnapshot();
  if (!diagram.previewAssetId) lastReportedGraph = "";
});

$effect(() => {
  const snapshot = graphSnapshot();
  if (snapshot === lastReportedGraph) return;
  lastReportedGraph = snapshot;
  onChange({
    ...diagram,
    graph: {
      ...diagram.graph,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: { label: String(node.data.label ?? "") },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label ? String(edge.label) : undefined,
        type: edge.type,
      })),
    },
  });
});
  function connect(connection: Connection): void { edges = addEdge({ ...connection, id: `${connection.source}-${connection.target}-${crypto.randomUUID()}` }, edges); }
  function addNode(): void { const id = crypto.randomUUID(); nodes = [...nodes, { id, position: { x: 130 + nodes.length * 40, y: 180 + nodes.length * 25 }, data: { label: label.trim() || `Step ${nodes.length + 1}` } }]; label = ""; }
  function deleteSelected(): void { nodes = nodes.filter((node) => !node.selected); const ids = new Set(nodes.map((node) => node.id)); edges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && !edge.selected); }
</script>
<div class="diagram-editor"><div class="diagram-tools"><input bind:value={label} placeholder="ノード名" onkeydown={(event) => { if (event.key === "Enter") addNode(); }} /><button onclick={addNode}>ノードを追加</button><button onclick={deleteSelected}>選択を削除</button></div><div class="flow-canvas"><SvelteFlow bind:nodes bind:edges fitView onconnect={connect}><Background /><Controls /></SvelteFlow></div></div>
