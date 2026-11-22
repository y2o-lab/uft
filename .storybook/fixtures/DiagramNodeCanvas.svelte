<script lang="ts">
  import "@xyflow/svelte/dist/style.css";
  import { SvelteFlow } from "@xyflow/svelte";
  import DiagramNode from "../../src/lib/components/DiagramNode.svelte";
  import type { DiagramNode as Node } from "../../src/lib/domain/workspace";

  let { data }: { data: Node["data"] } = $props();
  const nodeTypes = { diagram: DiagramNode };
  const nodes = $derived([{ id: "example", type: "diagram", position: { x: 40, y: 40 }, data }]);
</script>

<div style="height: 200px; width: min(100%, 480px);">
  <SvelteFlow {nodeTypes} {nodes} />
</div>
