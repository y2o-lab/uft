<script lang="ts">
  import { Handle, Position, type NodeProps } from "@xyflow/svelte";
  import { awsIconDataUrl, getAwsService } from "../diagrams/aws-icons";

  let { data, selected }: NodeProps = $props();
  let kind = $derived(String(data.kind ?? "process"));
  let service = $derived(getAwsService(String(data.awsService ?? "")));
  let icon = $derived(awsIconDataUrl(String(data.awsService ?? "")));
</script>

<div class:aws={kind === "aws-service"} class:decision={kind === "decision"} class:database={kind === "database"} class:note={kind === "note"} class:queue={kind === "queue"} class:terminator={kind === "terminator"} class:component={kind === "component"} class:selected class="diagram-node">
  <Handle id="top" type="source" position={Position.Top} />
  <Handle id="right" type="source" position={Position.Right} />
  <Handle id="bottom" type="source" position={Position.Bottom} />
  <Handle id="left" type="source" position={Position.Left} />

  {#if kind === "aws-service"}
    {#if icon}<img src={icon} alt="" draggable="false" />{/if}
    <strong>{String(data.label)}</strong>
    {#if service}<small>{service.label}</small>{/if}
  {:else}
    {#if kind === "component"}<span class="component-tab top" aria-hidden="true"></span><span class="component-tab bottom" aria-hidden="true"></span>{/if}
    <strong>{String(data.label)}</strong>
  {/if}
</div>

<style>
  .diagram-node {
    box-sizing: border-box;
    display: grid;
    place-items: center;
    width: 180px;
    height: 72px;
    border: 1.5px solid #527154;
    border-radius: 9px;
    background: #edf4ea;
    color: #2f4a34;
    padding: 10px 16px;
    text-align: center;
    box-shadow: 0 3px 9px rgb(54 76 56 / 9%);
  }

  .diagram-node strong { max-width: 148px; font-size: 14px; line-height: 1.25; overflow-wrap: anywhere; }
  .diagram-node.selected { border-color: #2869c7; box-shadow: 0 0 0 3px rgb(40 105 199 / 18%); }
  .diagram-node.terminator { height: 64px; border-radius: 32px; }
  .diagram-node.queue { background: #f5ecff; border-color: #735a8d; color: #4e3767; }

  .diagram-node.decision {
    width: 164px;
    height: 112px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .diagram-node.decision::before {
    position: absolute;
    z-index: -1;
    width: 78px;
    height: 78px;
    border: 1.5px solid #527154;
    background: #f2f7ef;
    content: "";
    transform: rotate(45deg);
    box-shadow: 3px 3px 9px rgb(54 76 56 / 9%);
  }

  .diagram-node.decision.selected::before { border-color: #2869c7; box-shadow: 0 0 0 3px rgb(40 105 199 / 18%); }

  .diagram-node.database {
    height: 88px;
    border-radius: 50% / 15%;
    background: linear-gradient(#e4eee1 0 18%, #f7faf5 18% 82%, #e4eee1 82%);
  }

  .diagram-node.note {
    background: linear-gradient(225deg, transparent 16px, #fff8cf 0);
    border-color: #8f7b39;
    border-radius: 2px;
    color: #5b4b19;
  }

  .diagram-node.note::after {
    position: absolute;
    top: 0;
    right: 0;
    width: 22px;
    height: 22px;
    border-bottom: 1px solid #8f7b39;
    border-left: 1px solid #8f7b39;
    content: "";
  }

  .diagram-node.component { padding-left: 30px; }
  .component-tab { position: absolute; left: -8px; width: 26px; height: 14px; border: 1px solid #527154; background: #fff; }
  .component-tab.top { top: 16px; }
  .component-tab.bottom { bottom: 16px; }

  .diagram-node.aws {
    display: flex;
    flex-direction: column;
    width: 184px;
    height: 104px;
    border-color: #8797a5;
    border-radius: 12px;
    background: #fff;
    color: #253746;
    padding: 8px 10px;
  }

  .diagram-node.aws img { width: 48px; height: 48px; user-select: none; }
  .diagram-node.aws strong { margin-top: 3px; font-size: 13px; }
  .diagram-node.aws small { max-width: 158px; overflow: hidden; color: #657789; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }

  :global(.diagram-node .svelte-flow__handle) {
    width: 9px;
    height: 9px;
    border: 2px solid #fff;
    background: #477eac;
    opacity: .38;
    transition: opacity .15s, transform .15s;
  }

  :global(.diagram-node:hover .svelte-flow__handle),
  :global(.diagram-node.selected .svelte-flow__handle),
  :global(.diagram-node .svelte-flow__handle.connectingfrom),
  :global(.diagram-node .svelte-flow__handle.connectingto) { opacity: 1; transform: scale(1.18); }
</style>
