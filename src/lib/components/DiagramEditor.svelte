<script lang="ts">
  import "@xyflow/svelte/dist/style.css";
  import {
    Background,
    ConnectionMode,
    Controls,
    MarkerType,
    MiniMap,
    SelectionMode,
    SvelteFlow,
    addEdge,
    type Connection,
    type Edge,
    type Node,
    type NodeTypes,
    type Viewport,
  } from "@xyflow/svelte";
  import {
    Copy,
    LayoutTemplate,
    MousePointer2,
    Move,
    Plus,
    Redo2,
    Shapes,
    Trash2,
    Undo2,
  } from "@lucide/svelte";
  import type {
    DiagramDocument,
    DiagramEdge,
    DiagramNode as StoredNode,
  } from "../domain/workspace";
  import { AWS_SERVICES } from "../diagrams/aws-icons";
  import {
    DIAGRAM_TEMPLATES,
    createDiagramTemplate,
  } from "../diagrams/templates";
  import DiagramNode from "./DiagramNode.svelte";

  let {
    diagram,
    onChange,
  }: {
    diagram: DiagramDocument;
    onChange: (diagram: DiagramDocument) => void;
  } = $props();

  type GraphState = {
    nodes: StoredNode[];
    edges: DiagramEdge[];
    viewport: Viewport;
  };

  const nodeTypes: NodeTypes = { diagram: DiagramNode };
  const basicKinds = [
    { value: "process", label: "処理", symbol: "▭", defaultLabel: "Process" },
    { value: "decision", label: "判断", symbol: "◇", defaultLabel: "Decision" },
    {
      value: "terminator",
      label: "開始 / 終了",
      symbol: "▱",
      defaultLabel: "Start / End",
    },
    {
      value: "component",
      label: "コンポーネント",
      symbol: "▣",
      defaultLabel: "Component",
    },
    {
      value: "database",
      label: "データベース",
      symbol: "◉",
      defaultLabel: "Database",
    },
    { value: "queue", label: "キュー", symbol: "▤", defaultLabel: "Queue" },
    { value: "note", label: "注釈", symbol: "◩", defaultLabel: "Note" },
  ] as const;

  let nodes = $state<Node[]>([]);
  let edges = $state<Edge[]>([]);
  let viewport = $state<Viewport>({ x: 0, y: 0, zoom: 1 });
  let nodeLabel = $state("");
  let nodeKind = $state("process");
  let edgeLabel = $state("");
  let edgeType = $state("smoothstep");
  let edgeDirection = $state<"forward" | "both" | "none">("forward");
  let edgeLineStyle = $state<"solid" | "dashed">("solid");
  let template = $state("");
  let selectedNodeIds = $state(new Set<string>());
  let selectedEdgeIds = $state(new Set<string>());
  let undoStack = $state<GraphState[]>([]);
  let redoStack = $state<GraphState[]>([]);
  let dragStartState: GraphState | null = null;
  let nodeDragging = $state(false);
  let inspectorEditing = $state(false);
  let inspectorEditStart: GraphState | null = null;
  let editorRoot: HTMLDivElement;
  let flowCanvas: HTMLDivElement;
  let flowKey = $state(0);
  let loadedDiagramId = "";
  let lastIncomingGraph = "";
  let lastReportedGraph = "";
  const localGraphHistory = new Set<string>();

  let selectedNode = $derived(
    selectedNodeIds.size === 1
      ? (nodes.find((node) => selectedNodeIds.has(node.id)) ?? null)
      : null,
  );
  let selectedEdge = $derived(
    selectedEdgeIds.size === 1 && selectedNodeIds.size === 0
      ? (edges.find((edge) => selectedEdgeIds.has(edge.id)) ?? null)
      : null,
  );
  let selectionCount = $derived(selectedNodeIds.size + selectedEdgeIds.size);

  function graphSnapshot(): string {
    return JSON.stringify(currentState());
  }

  $effect(() => {
    const incomingGraph = JSON.stringify({
      nodes: diagram.graph.nodes,
      edges: diagram.graph.edges,
      viewport: diagram.graph.viewport,
    });
    const localGraph = graphSnapshot();
    if (
      loadedDiagramId === diagram.entryId &&
      (incomingGraph === lastIncomingGraph ||
        incomingGraph === localGraph ||
        localGraphHistory.has(incomingGraph))
    ) {
      lastIncomingGraph = incomingGraph;
      return;
    }
    if (loadedDiagramId !== diagram.entryId) localGraphHistory.clear();
    loadedDiagramId = diagram.entryId;
    lastIncomingGraph = incomingGraph;
    nodes = diagram.graph.nodes.map(normaliseNode);
    edges = diagram.graph.edges.map(decorateEdge);
    const storedViewport = diagram.graph.viewport;
    viewport =
      storedViewport.x === 0 &&
      storedViewport.y === 0 &&
      storedViewport.zoom === 1
        ? viewportForNodes(diagram.graph.nodes)
        : { ...storedViewport };
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
    undoStack = [];
    redoStack = [];
    flowKey += 1;
    lastReportedGraph = graphSnapshot();
    rememberLocalGraph(lastReportedGraph);
  });

  $effect(() => {
    const snapshot = graphSnapshot();
    if (snapshot === lastReportedGraph) return;
    // Svelte Flow updates the bound node array for every pointer movement.
    // Persist once at drag end so async SVG saves cannot race each other and
    // re-apply an older position while the user is still dragging.
    if (nodeDragging || inspectorEditing) return;
    reportCurrentGraph();
  });

  function reportCurrentGraph(): void {
    lastReportedGraph = graphSnapshot();
    rememberLocalGraph(lastReportedGraph);
    onChange({
      ...diagram,
      graph: {
        ...diagram.graph,
        nodes: nodes.map(serialiseNode),
        edges: edges.map(serialiseEdge),
        viewport: { ...viewport },
      },
    });
  }

  function rememberLocalGraph(snapshot: string): void {
    localGraphHistory.add(snapshot);
    while (localGraphHistory.size > 50) {
      const oldest = localGraphHistory.values().next().value;
      if (typeof oldest !== "string") break;
      localGraphHistory.delete(oldest);
    }
  }

  function currentState(): GraphState {
    return {
      nodes: nodes.map(serialiseNode),
      edges: edges.map(serialiseEdge),
      viewport: { ...viewport },
    };
  }

  function stateKey(state: GraphState): string {
    return JSON.stringify(state);
  }

  function remember(state = currentState()): void {
    if (undoStack.at(-1) && stateKey(undoStack.at(-1) as GraphState) === stateKey(state))
      return;
    undoStack = [...undoStack, state].slice(-50);
    redoStack = [];
  }

  function restore(state: GraphState): void {
    nodes = state.nodes.map(normaliseNode);
    edges = state.edges.map(decorateEdge);
    viewport = { ...state.viewport };
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
    flowKey += 1;
  }

  function undo(): void {
    const previous = undoStack.at(-1);
    if (!previous) return;
    redoStack = [...redoStack, currentState()];
    undoStack = undoStack.slice(0, -1);
    restore(previous);
  }

  function redo(): void {
    const next = redoStack.at(-1);
    if (!next) return;
    undoStack = [...undoStack, currentState()];
    redoStack = redoStack.slice(0, -1);
    restore(next);
  }

  function connect(connection: Connection): void {
    remember();
    const newEdge: DiagramEdge = {
      ...connection,
      id: `${connection.source}-${connection.target}-${crypto.randomUUID()}`,
      type: "smoothstep",
      data: { direction: "forward", lineStyle: "solid" },
    };
    edges = addEdge(decorateEdge(newEdge), edges);
  }

  function canvasCenter(): { x: number; y: number } {
    const bounds = flowCanvas?.getBoundingClientRect();
    if (!bounds)
      return {
        x: 110 + (nodes.length % 4) * 220,
        y: 100 + Math.floor(nodes.length / 4) * 150,
      };
    return {
      x: (bounds.width / 2 - viewport.x) / viewport.zoom - 90,
      y: (bounds.height / 2 - viewport.y) / viewport.zoom - 40,
    };
  }

  function viewportForNodes(nextNodes: StoredNode[]): Viewport {
    const bounds = flowCanvas?.getBoundingClientRect();
    if (!bounds || nextNodes.length === 0) return { x: 0, y: 0, zoom: 1 };
    const sized = nextNodes.map((node) => {
      const kind = node.data.kind ?? "process";
      const width = kind === "decision" ? 164 : kind === "aws-service" ? 184 : 180;
      const height =
        kind === "decision"
          ? 112
          : kind === "aws-service"
            ? 104
            : kind === "database"
              ? 88
              : kind === "terminator"
                ? 64
                : 72;
      return { ...node.position, width, height };
    });
    const minX = Math.min(...sized.map((node) => node.x));
    const minY = Math.min(...sized.map((node) => node.y));
    const maxX = Math.max(...sized.map((node) => node.x + node.width));
    const maxY = Math.max(...sized.map((node) => node.y + node.height));
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const padding = 36;
    const zoom = Math.max(
      0.2,
      Math.min(
        1,
        (bounds.width - padding * 2) / graphWidth,
        (bounds.height - padding * 2) / graphHeight,
      ),
    );
    return {
      x: (bounds.width - graphWidth * zoom) / 2 - minX * zoom,
      y: (bounds.height - graphHeight * zoom) / 2 - minY * zoom,
      zoom,
    };
  }

  function addNode(kind = nodeKind, requestedLabel = nodeLabel): void {
    remember();
    const id = crypto.randomUUID();
    const aws = kind.startsWith("aws:") ? kind.slice(4) : undefined;
    const basic = basicKinds.find((candidate) => candidate.value === kind);
    const label =
      requestedLabel.trim() ||
      (aws
        ? AWS_SERVICES.find((service) => service.id === aws)?.label
        : basic?.defaultLabel) ||
      `Node ${nodes.length + 1}`;
    const position = canvasCenter();
    nodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      {
        id,
        type: "diagram",
        position,
        selected: true,
        data: {
          label,
          kind: aws ? "aws-service" : kind,
          ...(aws ? { awsService: aws } : {}),
        },
      },
    ];
    selectedNodeIds = new Set([id]);
    selectedEdgeIds = new Set();
    nodeLabel = "";
  }

  function applyEdgeAppearance(): void {
    if (selectedEdgeIds.size === 0) return;
    remember();
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

  function updateSelectedNodeLabel(label: string): void {
    if (!selectedNode) return;
    selectedNode.data.label = label;
  }

  function beginInspectorEdit(): void {
    if (inspectorEditing) return;
    inspectorEditStart = currentState();
    inspectorEditing = true;
  }

  function commitInspectorEdit(): void {
    if (
      inspectorEditStart &&
      stateKey(inspectorEditStart) !== stateKey(currentState())
    )
      remember(inspectorEditStart);
    inspectorEditStart = null;
    inspectorEditing = false;
    reportCurrentGraph();
  }

  function updateSelectedNodeKind(value: string): void {
    if (!selectedNode) return;
    remember();
    const awsService = value.startsWith("aws:") ? value.slice(4) : undefined;
    selectedNode.data.kind = awsService ? "aws-service" : value;
    if (awsService) selectedNode.data.awsService = awsService;
    else delete selectedNode.data.awsService;
  }

  function applyTemplate(): void {
    if (!template) return;
    remember();
    const next = createDiagramTemplate(template);
    nodes = next.nodes.map(normaliseNode);
    edges = next.edges.map(decorateEdge);
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
    viewport = viewportForNodes(next.nodes);
    // Start the new save generation inside the click handler. This prevents a
    // slower initial-template save from winning before the reactive effect runs.
    reportCurrentGraph();
    flowKey += 1;
    template = "";
  }

  function deleteSelected(): void {
    if (selectionCount === 0) return;
    remember();
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

  function duplicateSelected(): void {
    const selected = nodes.filter((node) => selectedNodeIds.has(node.id));
    if (selected.length === 0) return;
    remember();
    const ids = new Map(selected.map((node) => [node.id, crypto.randomUUID()]));
    const duplicates = selected.map((node) => ({
      ...node,
      id: ids.get(node.id) as string,
      position: { x: node.position.x + 28, y: node.position.y + 28 },
      data: { ...node.data },
      selected: true,
    }));
    const duplicatedEdges = edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) =>
        decorateEdge({
          ...serialiseEdge(edge),
          id: crypto.randomUUID(),
          source: ids.get(edge.source) as string,
          target: ids.get(edge.target) as string,
        }),
      );
    nodes = [
      ...nodes.map((node) => ({ ...node, selected: false })),
      ...duplicates,
    ];
    edges = [
      ...edges.map((edge) => ({ ...edge, selected: false })),
      ...duplicatedEdges,
    ];
    selectedNodeIds = new Set(duplicates.map((node) => node.id));
    selectedEdgeIds = new Set();
  }

  function selectionChanged(selection: {
    nodes: Node[];
    edges: Edge[];
  }): void {
    // Bound node-data updates can briefly emit an empty selection. Emptying is
    // handled explicitly by pane clicks so property editing stays stable.
    if (selection.nodes.length === 0 && selection.edges.length === 0) return;
    selectedNodeIds = new Set(selection.nodes.map((node) => node.id));
    selectedEdgeIds = new Set(selection.edges.map((edge) => edge.id));
    if (selection.edges.length === 1 && selection.nodes.length === 0) {
      const edge = selection.edges[0];
      edgeLabel = edge.label ? String(edge.label) : "";
      edgeType = edge.type ?? "smoothstep";
      edgeDirection =
        edge.data?.direction === "both" || edge.data?.direction === "none"
          ? edge.data.direction
          : "forward";
      edgeLineStyle = edge.data?.lineStyle === "dashed" ? "dashed" : "solid";
    }
  }

  function clearSelection(): void {
    selectedNodeIds = new Set();
    selectedEdgeIds = new Set();
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (!editorRoot?.contains(target)) return;
    const isEditing =
      target.matches("input, select, textarea") || target.isContentEditable;
    if (isEditing) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      deleteSelected();
    }
  }

  function nodeKindValue(node: Node): string {
    return node.data.kind === "aws-service"
      ? `aws:${String(node.data.awsService ?? "")}`
      : String(node.data.kind ?? "process");
  }

  function normaliseNode(node: StoredNode): Node {
    return {
      ...node,
      position: { ...node.position },
      type: "diagram",
      data: { ...node.data, kind: node.data.kind ?? "process" },
    };
  }

  function serialiseNode(node: Node): StoredNode {
    return {
      id: node.id,
      type: "diagram",
      position: { ...node.position },
      data: {
        ...node.data,
        label: String(node.data.label ?? ""),
        kind: String(
          node.data.kind ?? "process",
        ) as StoredNode["data"]["kind"],
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
        direction:
          edge.data?.direction === "both" || edge.data?.direction === "none"
            ? edge.data.direction
            : "forward",
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
      markerStart:
        direction === "both"
          ? { type: MarkerType.ArrowClosed, color: "#607d63" }
          : undefined,
      markerEnd:
        direction === "none"
          ? undefined
          : { type: MarkerType.ArrowClosed, color: "#607d63" },
      style:
        edge.data?.lineStyle === "dashed"
          ? "stroke:#607d63;stroke-width:2;stroke-dasharray:7 5"
          : "stroke:#607d63;stroke-width:2",
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

<svelte:window onkeydown={handleKeydown} />

<div
  bind:this={editorRoot}
  class="diagram-editor"
  role="application"
  aria-label="図表エディタ"
>
  <header class="diagram-commandbar">
    <div class="command-group" aria-label="履歴">
      <button aria-label="元に戻す" title="元に戻す (⌘Z)" onclick={undo} disabled={undoStack.length === 0}
        ><Undo2 aria-hidden="true" /></button
      >
      <button aria-label="やり直す" title="やり直す (⇧⌘Z)" onclick={redo} disabled={redoStack.length === 0}
        ><Redo2 aria-hidden="true" /></button
      >
    </div>
    <div class="command-divider"></div>
    <div class="command-group selection-actions" aria-label="選択項目の操作">
      <span>{selectionCount ? `${selectionCount}件を選択` : "選択なし"}</span>
      <button
        class="button-with-icon"
        onclick={duplicateSelected}
        disabled={selectedNodeIds.size === 0}
        aria-label="選択ノードを複製"
        title="複製 (⌘D)"
        ><Copy aria-hidden="true" />複製</button
      >
      <button
        class="button-with-icon danger"
        onclick={deleteSelected}
        disabled={selectionCount === 0}
        aria-label="選択を削除"
        title="削除 (Delete)"
        ><Trash2 aria-hidden="true" />削除</button
      >
    </div>
    <div class="interaction-legend" aria-label="キャンバス操作">
      <span><MousePointer2 aria-hidden="true" />ドラッグで選択・移動</span>
      <span><Move aria-hidden="true" />スクロールで画面移動</span>
      <span>⌘/Ctrl ＋ スクロールでズーム</span>
    </div>
  </header>

  <div class="diagram-layout">
    <aside class="diagram-panel node-library" aria-label="要素を追加">
      <div class="panel-heading">
        <Shapes aria-hidden="true" />
        <div><strong>要素を追加</strong><small>中央に配置されます</small></div>
      </div>
      <label class="field-label" for="new-node-label">名前（任意）</label>
      <input
        id="new-node-label"
        bind:value={nodeLabel}
        aria-label="ノード名"
        placeholder="例: API Gateway"
        onkeydown={(event) => {
          if (event.key === "Enter") addNode();
        }}
      />
      <div class="add-node-row">
        <select bind:value={nodeKind} aria-label="追加するノードの種類">
          <optgroup label="フロー・アーキテクチャ">
            {#each basicKinds as kind}<option value={kind.value}>{kind.label}</option>{/each}
          </optgroup>
          <optgroup label="AWS 公式アイコン">
            {#each AWS_SERVICES as service}<option value={`aws:${service.id}`}>{service.label}</option>{/each}
          </optgroup>
        </select>
        <button class="primary icon-only" aria-label="ノードを追加" title="ノードを追加" onclick={() => addNode()}
          ><Plus aria-hidden="true" /></button
        >
      </div>
      <div class="shape-grid" aria-label="基本図形">
        {#each basicKinds as kind}
          <button onclick={() => addNode(kind.value, nodeLabel)} title={`${kind.label}を追加`}>
            <span aria-hidden="true">{kind.symbol}</span><small>{kind.label}</small>
          </button>
        {/each}
      </div>
      <section class="template-section">
        <div class="section-title"><LayoutTemplate aria-hidden="true" /><strong>テンプレート</strong></div>
        <select bind:value={template} aria-label="図表テンプレート">
          <option value="">テンプレートを選択…</option>
          {#each DIAGRAM_TEMPLATES as option}<option value={option.id}>{option.label}</option>{/each}
        </select>
        <button class="template-button" onclick={applyTemplate} disabled={!template}>展開</button>
        <small class="replace-note">現在の図を置き換えます（Undo可能）</small>
      </section>
    </aside>

    <section class="canvas-column" aria-label="図表キャンバス">
      <div class="canvas-status">
        <span>接続はノード四辺の青い点からドラッグ</span>
        <span>{Math.round(viewport.zoom * 100)}%</span>
      </div>
      <div class="flow-canvas" bind:this={flowCanvas}>
        {#key flowKey}
          <SvelteFlow
            bind:nodes
            bind:edges
            {nodeTypes}
            initialViewport={viewport}
            connectionMode={ConnectionMode.Loose}
            onconnect={connect}
            onselectionchange={selectionChanged}
            onpaneclick={clearSelection}
            onmoveend={(_event, nextViewport) => {
              viewport = { ...nextViewport };
            }}
            onnodedragstart={() => {
              nodeDragging = true;
              dragStartState = currentState();
            }}
            onnodedragstop={() => {
              if (dragStartState && stateKey(dragStartState) !== stateKey(currentState()))
                remember(dragStartState);
              dragStartState = null;
              nodeDragging = false;
              reportCurrentGraph();
            }}
            deleteKey={null}
            minZoom={0.2}
            maxZoom={2}
            nodeDragThreshold={3}
            connectionDragThreshold={4}
            zoomOnScroll={false}
            zoomActivationKey={["Meta", "Control"]}
            zoomOnDoubleClick={false}
            zoomOnPinch={true}
            panOnScroll={true}
            panOnScrollSpeed={0.7}
            panOnDrag={[1, 2]}
            selectionOnDrag={true}
            selectionMode={SelectionMode.Partial}
            autoPanOnNodeDrag={false}
          >
            <Background gap={20} size={1} patternColor="#dce4d9" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              ariaLabel="図全体のミニマップ"
            />
            <Controls
              position="bottom-left"
              orientation="horizontal"
              aria-label="ズームと表示位置"
              fitViewOptions={{ padding: 0.18, maxZoom: 1, duration: 220 }}
            />
          </SvelteFlow>
        {/key}
      </div>
    </section>

    <aside class="diagram-panel inspector" aria-label="選択項目の設定">
      <div class="panel-heading">
        <MousePointer2 aria-hidden="true" />
        <div><strong>プロパティ</strong><small>選択内容を編集</small></div>
      </div>
      {#if selectedNode}
        <div class="selection-badge">ノード</div>
        <label class="field-label" for="selected-node-label">表示名</label>
        <input
          id="selected-node-label"
          value={String(selectedNode.data.label ?? "")}
          aria-label="選択ノードの表示名"
          onfocus={beginInspectorEdit}
          oninput={(event) => updateSelectedNodeLabel(event.currentTarget.value)}
          onblur={commitInspectorEdit}
        />
        <label class="field-label" for="selected-node-kind">種類</label>
        <select
          id="selected-node-kind"
          value={nodeKindValue(selectedNode)}
          aria-label="選択ノードの種類"
          onchange={(event) => updateSelectedNodeKind(event.currentTarget.value)}
        >
          <optgroup label="フロー・アーキテクチャ">
            {#each basicKinds as kind}<option value={kind.value}>{kind.label}</option>{/each}
          </optgroup>
          <optgroup label="AWS 公式アイコン">
            {#each AWS_SERVICES as service}<option value={`aws:${service.id}`}>{service.label}</option>{/each}
          </optgroup>
        </select>
        <p class="inspector-help">ノードをドラッグして移動。矢印キーでも微調整できます。</p>
      {:else if selectedEdge}
        <div class="selection-badge">接続線</div>
        <label class="field-label" for="edge-label">ラベル</label>
        <input id="edge-label" bind:value={edgeLabel} aria-label="接続線のラベル" placeholder="例: request" />
        <label class="field-label" for="edge-type">形</label>
        <select id="edge-type" bind:value={edgeType} aria-label="接続線の形">
          <option value="smoothstep">角丸直交</option>
          <option value="step">直交</option>
          <option value="default">曲線</option>
          <option value="straight">直線</option>
        </select>
        <label class="field-label" for="edge-direction">向き</label>
        <select id="edge-direction" bind:value={edgeDirection} aria-label="接続線の向き">
          <option value="forward">片方向 →</option>
          <option value="both">双方向 ↔</option>
          <option value="none">矢印なし ─</option>
        </select>
        <label class="field-label" for="edge-style">線種</label>
        <select id="edge-style" bind:value={edgeLineStyle} aria-label="接続線の線種">
          <option value="solid">実線</option>
          <option value="dashed">破線</option>
        </select>
        <button class="primary apply-button" onclick={applyEdgeAppearance}>選択線に適用</button>
      {:else if selectionCount > 1}
        <div class="empty-inspector">
          <strong>{selectionCount}件を選択中</strong>
          <p>まとめて移動・複製・削除できます。</p>
        </div>
      {:else}
        <div class="empty-inspector">
          <MousePointer2 aria-hidden="true" />
          <strong>要素を選択</strong>
          <p>ノードや接続線をクリックすると、ここで名前や見た目を編集できます。</p>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .diagram-editor {
    display: grid;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    grid-template-rows: 48px minmax(0, 1fr);
    border: 1px solid #d5ded2;
    border-radius: 12px;
    outline: none;
    background: #fff;
    box-shadow: 0 10px 30px rgb(47 69 49 / 8%);
  }

  .diagram-editor:focus-visible {
    box-shadow: 0 0 0 3px rgb(74 121 79 / 18%), 0 10px 30px rgb(47 69 49 / 8%);
  }

  .diagram-commandbar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid #dfe6dc;
    background: #f8faf6;
  }

  .command-group,
  .selection-actions,
  .interaction-legend,
  .panel-heading,
  .add-node-row,
  .section-title {
    display: flex;
    align-items: center;
  }

  .command-group { gap: 4px; }
  .command-divider { width: 1px; height: 22px; background: #d7dfd4; }
  .selection-actions { min-width: 0; gap: 6px; }
  .selection-actions > span { min-width: 64px; color: #718071; font-size: 11px; }

  .diagram-commandbar button,
  .diagram-panel button {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid #cad6c7;
    border-radius: 7px;
    background: #fff;
    color: #405644;
    padding: 6px 9px;
    font-size: 11px;
  }

  .diagram-commandbar button:hover:not(:disabled),
  .diagram-panel button:hover:not(:disabled) {
    border-color: #8eaa8b;
    background: #f0f7ee;
  }

  .diagram-commandbar button:focus-visible,
  .diagram-panel button:focus-visible,
  .diagram-panel input:focus-visible,
  .diagram-panel select:focus-visible {
    outline: 3px solid rgb(65 119 72 / 18%);
    outline-offset: 1px;
    border-color: #59805d;
  }

  .diagram-commandbar button:disabled,
  .diagram-panel button:disabled { cursor: default; opacity: 0.42; }
  .diagram-commandbar button :global(svg),
  .panel-heading > :global(svg),
  .section-title :global(svg) { width: 15px; height: 15px; flex: 0 0 auto; }
  .diagram-commandbar .danger { color: #9a5148; }

  .interaction-legend {
    min-width: 0;
    gap: 14px;
    margin-left: auto;
    color: #748174;
    font-size: 10px;
    white-space: nowrap;
  }

  .interaction-legend span { display: inline-flex; align-items: center; gap: 4px; }
  .interaction-legend :global(svg) { width: 13px; height: 13px; }

  .diagram-layout {
    display: grid;
    min-height: 0;
    grid-template-columns: 210px minmax(320px, 1fr) 220px;
  }

  .diagram-panel {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px;
    background: #fbfcf9;
  }

  .node-library { border-right: 1px solid #e0e6de; }
  .inspector { border-left: 1px solid #e0e6de; }

  .panel-heading {
    gap: 9px;
    margin-bottom: 16px;
    color: #405544;
  }

  .panel-heading > :global(svg) {
    width: 28px;
    height: 28px;
    border: 1px solid #d9e3d6;
    border-radius: 7px;
    background: #f0f6ee;
    padding: 6px;
    color: #5f8163;
  }

  .panel-heading div { display: grid; gap: 1px; }
  .panel-heading strong { font-size: 12px; }
  .panel-heading small { color: #8a9589; font-size: 9px; }
  .field-label { display: block; margin: 11px 0 5px; color: #6e7b6e; font-size: 10px; font-weight: 650; }

  .diagram-panel input,
  .diagram-panel select {
    width: 100%;
    min-width: 0;
    height: 34px;
    border: 1px solid #cfd8cd;
    border-radius: 7px;
    outline: 0;
    background: #fff;
    color: #354938;
    padding: 6px 8px;
    font-size: 11px;
  }

  .add-node-row { gap: 5px; margin-top: 6px; }
  .add-node-row select { flex: 1; }
  .diagram-panel .icon-only { width: 34px; flex: 0 0 34px; padding: 0; }
  .diagram-panel .primary { border-color: #385e3e; background: #385e3e; color: #fff; }
  .diagram-panel .primary:hover:not(:disabled) { border-color: #294c30; background: #294c30; }

  .shape-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 12px;
  }

  .shape-grid button { min-height: 54px; flex-direction: column; gap: 1px; padding: 5px; }
  .shape-grid button > span { color: #4e7252; font-size: 21px; line-height: 1; }
  .shape-grid button small { color: #677667; font-size: 9px; }

  .template-section {
    display: grid;
    gap: 7px;
    margin-top: 16px;
    border-top: 1px solid #e1e7df;
    padding-top: 15px;
  }

  .section-title { gap: 6px; color: #4a5d4d; font-size: 11px; }
  .template-section .template-button { width: 100%; }
  .replace-note { color: #8d978c; font-size: 9px; line-height: 1.4; }

  .canvas-column { display: grid; min-width: 0; min-height: 0; grid-template-rows: 29px minmax(0, 1fr); background: #f8faf7; }
  .canvas-status { display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-bottom: 1px solid #e4e9e2; color: #7b887b; font-size: 9px; }
  .flow-canvas { min-height: 0; touch-action: none; }

  :global(.flow-canvas .svelte-flow) { background: #fbfdf9; }
  :global(.flow-canvas .svelte-flow__pane) { cursor: crosshair; }
  :global(.flow-canvas .svelte-flow__node) { cursor: grab; }
  :global(.flow-canvas .svelte-flow__node.dragging) { cursor: grabbing; }
  :global(.flow-canvas .svelte-flow__edge.selected path) { stroke: #2869c7 !important; }
  :global(.flow-canvas .svelte-flow__edge-textbg) { fill: #fffefa; }
  :global(.flow-canvas .svelte-flow__minimap) {
    border: 1px solid #ced9cb;
    border-radius: 8px;
    background: #f7faf5;
    box-shadow: 0 4px 12px rgb(43 62 45 / 10%);
  }
  :global(.flow-canvas .svelte-flow__controls) {
    overflow: hidden;
    border: 1px solid #ced9cb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgb(43 62 45 / 10%);
  }
  :global(.flow-canvas .svelte-flow__controls-button) { border-bottom: 0; }
  :global(.flow-canvas .svelte-flow__selection) { border: 1px solid #4d79bd; background: rgb(77 121 189 / 10%); }

  .selection-badge {
    display: inline-flex;
    border-radius: 999px;
    background: #e5f0e2;
    color: #456348;
    padding: 4px 8px;
    font-size: 9px;
    font-weight: 700;
  }

  .inspector-help { margin: 14px 0 0; color: #7c887d; font-size: 10px; line-height: 1.55; }
  .apply-button { width: 100%; margin-top: 13px; }
  .empty-inspector { display: grid; place-items: center; padding: 48px 8px 20px; color: #788678; text-align: center; }
  .empty-inspector > :global(svg) { width: 24px; height: 24px; margin-bottom: 10px; color: #8da08e; }
  .empty-inspector strong { color: #536654; font-size: 12px; }
  .empty-inspector p { margin: 7px 0 0; font-size: 10px; line-height: 1.6; }

  @media (max-width: 1150px) {
    .diagram-layout { grid-template-columns: 186px minmax(300px, 1fr) 198px; }
    .interaction-legend span:nth-child(-n + 2) { display: none; }
  }

  @media (max-width: 850px) {
    .diagram-editor { height: max(680px, calc(100dvh - 230px)); min-height: 620px; grid-template-rows: auto minmax(0, 1fr); }
    .diagram-commandbar { min-height: 48px; overflow-x: auto; }
    .interaction-legend { display: none; }
    .diagram-layout {
      overflow-y: auto;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(430px, 1fr) auto;
    }
    .diagram-panel { overflow: visible; }
    .node-library { border-right: 0; border-bottom: 1px solid #e0e6de; }
    .inspector { min-height: 170px; border-top: 1px solid #e0e6de; border-left: 0; }
    .shape-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .template-section { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
    .template-section .section-title,
    .template-section .replace-note { grid-column: 1 / -1; }
    .canvas-column { min-height: 430px; }
  }

  @media (max-width: 520px) {
    .selection-actions > span { display: none; }
    .selection-actions .button-with-icon { width: 34px; overflow: hidden; padding: 0; font-size: 0; }
    .selection-actions .button-with-icon :global(svg) { width: 15px; height: 15px; }
    .shape-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
