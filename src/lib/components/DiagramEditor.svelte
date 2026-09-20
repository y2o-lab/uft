<script lang="ts">
  import "@xyflow/svelte/dist/style.css";
  import {
    Background,
    ConnectionMode,
    Controls,
    MarkerType,
    MiniMap,
    SvelteFlow,
    addEdge,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
  } from "@xyflow/svelte";
  import { LayoutTemplate, Plus, Trash2 } from "@lucide/svelte";
  import type { DiagramDocument, DiagramEdge, DiagramNode as StoredNode } from "../domain/workspace";
  import { AWS_SERVICES } from "../diagrams/aws-icons";
  import { DIAGRAM_TEMPLATES, createDiagramTemplate } from "../diagrams/templates";
  import DiagramNode from "./DiagramNode.svelte";

  let { diagram, onChange }: { diagram: DiagramDocument; onChange: (diagram: DiagramDocument) => void } = $props();

  const nodeTypes: NodeTypes = { diagram: DiagramNode };
  const basicKinds = [
    { value: "process", label: "処理", defaultLabel: "Process" },
    { value: "decision", label: "判断", defaultLabel: "Decision" },
    { value: "terminator", label: "開始 / 終了", defaultLabel: "Start / End" },
    { value: "component", label: "コンポーネント", defaultLabel: "Component" },
    { value: "database", label: "データベース", defaultLabel: "Database" },
    { value: "queue", label: "キュー", defaultLabel: "Queue" },
    { value: "note", label: "注釈", defaultLabel: "Note" },
  ] as const;

  let nodes = $state<Node[]>([]);
  let edges = $state<Edge[]>([]);
  let nodeLabel = $state("");
  let nodeKind = $state("process");
  let edgeLabel = $state("");
  let edgeType = $state("smoothstep");
  let edgeDirection = $state<"forward" | "both" | "none">("forward");
  let edgeLineStyle = $state<"solid" | "dashed">("solid");
  let template = $state("");
  let selectedNodeIds = $state(new Set<string>());
  let selectedEdgeIds = $state(new Set<string>());
  let flowKey = $state(0);
  let loadedDiagramId = "";
  let lastIncomingGraph = "";
  let lastReportedGraph = "";

  function graphSnapshot(): string {
    return JSON.stringify({
      nodes: nodes.map(serialiseNode),
      edges: edges.map(serialiseEdge),
    });
  }

  $effect(() => {
    const incomingGraph = JSON.stringify({
      nodes: diagram.graph.nodes,
      edges: diagram.graph.edges,
    });
    const localGraph = graphSnapshot();
    if (
      loadedDiagramId === diagram.entryId &&
      (incomingGraph === lastIncomingGraph || incomingGraph === localGraph)
    )
      return;
    loadedDiagramId = diagram.entryId;
    lastIncomingGraph = incomingGraph;
    nodes = diagram.graph.nodes.map(normaliseNode);
    edges = diagram.graph.edges.map(decorateEdge);
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
    flowKey += 1;
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
        nodes: nodes.map(serialiseNode),
        edges: edges.map(serialiseEdge),
      },
    });
  });

  function connect(connection: Connection): void {
    const newEdge: DiagramEdge = {
      ...connection,
      id: `${connection.source}-${connection.target}-${crypto.randomUUID()}`,
      type: edgeType,
      label: edgeLabel.trim() || undefined,
      data: { direction: edgeDirection, lineStyle: edgeLineStyle },
    };
    edges = addEdge(decorateEdge(newEdge), edges);
    edgeLabel = "";
  }

  function addNode(): void {
    const id = crypto.randomUUID();
    const aws = nodeKind.startsWith("aws:") ? nodeKind.slice(4) : undefined;
    const basic = basicKinds.find((kind) => kind.value === nodeKind);
    const label = nodeLabel.trim() || (aws ? AWS_SERVICES.find((service) => service.id === aws)?.label : basic?.defaultLabel) || `Node ${nodes.length + 1}`;
    nodes = [
      ...nodes,
      {
        id,
        type: "diagram",
        position: { x: 110 + (nodes.length % 4) * 220, y: 100 + Math.floor(nodes.length / 4) * 150 },
        data: { label, kind: aws ? "aws-service" : nodeKind, ...(aws ? { awsService: aws } : {}) },
      },
    ];
    nodeLabel = "";
  }

  function applyEdgeAppearance(): void {
    edges = edges.map((edge) =>
      selectedEdgeIds.has(edge.id)
        ? {
            ...decorateEdge({
              ...serialiseEdge(edge),
              type: edgeType,
              label: edgeLabel.trim() || undefined,
              data: { direction: edgeDirection, lineStyle: edgeLineStyle },
            }),
            selected: true,
          }
        : edge,
    );
  }

  function applyTemplate(): void {
    if (!template) return;
    const next = createDiagramTemplate(template);
    nodes = next.nodes.map(normaliseNode);
    edges = next.edges.map(decorateEdge);
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
    flowKey += 1;
    template = "";
  }

  function deleteSelected(): void {
    nodes = nodes.filter((node) => !selectedNodeIds.has(node.id));
    const ids = new Set(nodes.map((node) => node.id));
    edges = edges.filter(
      (edge) =>
        ids.has(edge.source) &&
        ids.has(edge.target) &&
        !selectedEdgeIds.has(edge.id),
    );
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
  }

  function selectionChanged(selection: { nodes: Node[]; edges: Edge[] }): void {
    selectedNodeIds = new Set(selection.nodes.map((node) => node.id));
    selectedEdgeIds = new Set(selection.edges.map((edge) => edge.id));
  }

  function normaliseNode(node: StoredNode): Node {
    return {
      ...node,
      type: "diagram",
      data: { ...node.data, kind: node.data.kind ?? "process" },
    };
  }

  function serialiseNode(node: Node): StoredNode {
    return {
      id: node.id,
      type: "diagram",
      position: node.position,
      data: {
        ...node.data,
        label: String(node.data.label ?? ""),
        kind: String(node.data.kind ?? "process") as StoredNode["data"]["kind"],
      },
    };
  }

  function serialiseEdge(edge: Edge): DiagramEdge {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label ? String(edge.label) : undefined,
      type: edge.type ?? "smoothstep",
      data: {
        direction: edge.data?.direction === "both" || edge.data?.direction === "none" ? edge.data.direction : "forward",
        lineStyle: edge.data?.lineStyle === "dashed" ? "dashed" : "solid",
      },
    };
  }

  function decorateEdge(edge: DiagramEdge): Edge {
    const direction = edge.data?.direction ?? "forward";
    const inferredHandles =
      edge.sourceHandle || edge.targetHandle
        ? {
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          }
        : inferHandles(edge);
    return {
      ...edge,
      ...inferredHandles,
      type: edge.type ?? "smoothstep",
      data: {
        direction,
        lineStyle: edge.data?.lineStyle ?? "solid",
      },
      markerStart: direction === "both" ? { type: MarkerType.ArrowClosed, color: "#607d63" } : undefined,
      markerEnd: direction === "none" ? undefined : { type: MarkerType.ArrowClosed, color: "#607d63" },
      style: edge.data?.lineStyle === "dashed" ? "stroke:#607d63;stroke-width:2;stroke-dasharray:7 5" : "stroke:#607d63;stroke-width:2",
      labelStyle: "fill:#405243;font-weight:600",
    };
  }

  function inferHandles(edge: DiagramEdge): {
    sourceHandle?: string;
    targetHandle?: string;
  } {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    if (!source || !target) return {};
    const dx = target.position.x - source.position.x;
    const dy = target.position.y - source.position.y;
    if (Math.abs(dx) >= Math.abs(dy))
      return dx >= 0
        ? { sourceHandle: "right", targetHandle: "left" }
        : { sourceHandle: "left", targetHandle: "right" };
    return dy >= 0
      ? { sourceHandle: "bottom", targetHandle: "top" }
      : { sourceHandle: "top", targetHandle: "bottom" };
  }
</script>

<div class="diagram-editor">
  <div class="diagram-tools" aria-label="図表ツール">
    <div class="tool-group node-tools">
      <select bind:value={nodeKind} aria-label="追加するノードの種類">
        <optgroup label="フロー・アーキテクチャ">
          {#each basicKinds as kind}<option value={kind.value}>{kind.label}</option>{/each}
        </optgroup>
        <optgroup label="AWS 公式アイコン">
          {#each AWS_SERVICES as service}<option value={`aws:${service.id}`}>{service.label}</option>{/each}
        </optgroup>
      </select>
      <input bind:value={nodeLabel} aria-label="ノード名" placeholder="ノード名" onkeydown={(event) => { if (event.key === "Enter") addNode(); }} />
      <button class="button-with-icon" aria-label="ノードを追加" onclick={addNode}><Plus aria-hidden="true" />追加</button>
    </div>
    <div class="tool-group edge-tools">
      <select bind:value={edgeType} aria-label="接続線の形">
        <option value="smoothstep">角丸直交</option>
        <option value="step">直交</option>
        <option value="default">曲線</option>
        <option value="straight">直線</option>
      </select>
      <select bind:value={edgeDirection} aria-label="接続線の向き">
        <option value="forward">片方向 →</option>
        <option value="both">双方向 ↔</option>
        <option value="none">矢印なし ─</option>
      </select>
      <select bind:value={edgeLineStyle} aria-label="接続線の線種">
        <option value="solid">実線</option>
        <option value="dashed">破線</option>
      </select>
      <input bind:value={edgeLabel} aria-label="接続線のラベル" placeholder="線のラベル" />
      <button onclick={applyEdgeAppearance}>選択線に適用</button>
    </div>
    <div class="tool-group template-tools">
      <select bind:value={template} aria-label="図表テンプレート">
        <option value="">テンプレート…</option>
        {#each DIAGRAM_TEMPLATES as option}<option value={option.id}>{option.label}</option>{/each}
      </select>
      <button class="button-with-icon" onclick={applyTemplate} disabled={!template}><LayoutTemplate aria-hidden="true" />展開</button>
      <button class="button-with-icon danger" aria-label="選択を削除" onclick={deleteSelected}><Trash2 aria-hidden="true" />削除</button>
    </div>
  </div>
  <p class="diagram-hint">四辺の青い接続点から自由な方向へドラッグできます。線を選択すると形・向き・破線・ラベルを変更できます。</p>
  <div class="flow-canvas">
    {#key flowKey}
      <SvelteFlow bind:nodes bind:edges {nodeTypes} fitView fitViewOptions={{ padding: 0.16, maxZoom: 1 }} connectionMode={ConnectionMode.Loose} onconnect={connect} onselectionchange={selectionChanged} minZoom={0.2} maxZoom={2}>
        <Background />
        <MiniMap pannable zoomable />
        <Controls />
      </SvelteFlow>
    {/key}
  </div>
</div>
