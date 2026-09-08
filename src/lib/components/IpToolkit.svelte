<script lang="ts">
  import { onMount } from "svelte";
  import { Copy, Globe2, LoaderCircle, Search } from "@lucide/svelte";
  import {
    cidrDetails,
    classifyIp,
    cleanIpList,
    expandIpv6,
    extractIps,
    formatCidr,
    formatIp,
    ipInCidr,
    ipv4ToBinary,
    ipv4ToHex,
    mappedIpv4,
    mappedIpv6,
    mergeCidrs,
    parseCidr,
    parseIp,
    parseIpv4Binary,
    parseIpv4Hex,
    parseIpv4Integer,
    rangeToCidrs,
    splitCidr,
    type ParsedIp,
  } from "../ip/ip";
  import { lookupPublicIp, type PublicIpInfo } from "../ip/ipwhois";

  type Section = "lookup" | "inspect" | "network" | "convert" | "bulk";
  const labels: Record<Section, string> = { lookup: "Lookup", inspect: "Inspect", network: "Network", convert: "Convert", bulk: "Bulk" };
  const categoryLabels: Record<string, string> = {
    public: "Public", private: "Private", loopback: "Loopback", "link-local": "Link-local", multicast: "Multicast", documentation: "Documentation", benchmarking: "Benchmarking", "carrier-grade-nat": "Carrier-grade NAT", reserved: "Reserved", unspecified: "Unspecified",
  };
  let section = $state<Section>("lookup");
  let lookupInput = $state("");
  let lookupResult = $state<PublicIpInfo | null>(null);
  let lookupError = $state("");
  let lookupBusy = $state(false);
  let myIp = $state("");
  let inspectorInput = $state("192.168.1.10");
  let networkMode = $state("calculator");
  let networkInput = $state("192.168.1.20/24");
  let networkSecondInput = $state("192.168.1.20");
  let networkPrefix = $state("26");
  let networkOutput = $state<string[]>([]);
  let networkError = $state("");
  let convertInput = $state("192.0.2.1");
  let bulkInput = $state("");
  let bulkResults = $state<Array<{ ip: ParsedIp; result?: PublicIpInfo; error?: string }>>([]);
  let bulkBusy = $state(false);
  let logInput = $state("");

  const inspector = $derived(parseIp(inspectorInput));
  const conversion = $derived(parseConversion(convertInput));
  const cleaned = $derived(cleanIpList(bulkInput));
  const extracted = $derived(extractIps(logInput));

  function parseConversion(source: string): ParsedIp | null {
    return parseIp(source) ?? parseIpv4Integer(source) ?? parseIpv4Binary(source) ?? parseIpv4Hex(source);
  }

  async function lookup(input = lookupInput): Promise<void> {
    lookupError = "";
    lookupResult = null;
    const ip = parseIp(input);
    if (!ip) { lookupError = "有効な IPv4 または IPv6 アドレスを入力してください。"; return; }
    if (classifyIp(ip) !== "public") { lookupError = `${categoryLabels[classifyIp(ip)]} IP は外部 API に送信しません。ローカル判定のみ利用できます。`; return; }
    lookupBusy = true;
    try { lookupResult = await lookupPublicIp(ip.normalized); } catch (error) { lookupError = error instanceof Error ? error.message : "Lookup に失敗しました。"; }
    finally { lookupBusy = false; }
  }

  async function lookupMyIp(): Promise<void> {
    lookupError = "";
    lookupResult = null;
    lookupBusy = true;
    try {
      lookupResult = await lookupPublicIp();
      myIp = lookupResult.ip;
      lookupInput = myIp;
    } catch (error) { lookupError = error instanceof Error ? error.message : "My IP の取得に失敗しました。"; }
    finally { lookupBusy = false; }
  }

  function calculateNetwork(): void {
    networkError = "";
    networkOutput = [];
    const mode = networkMode;
    if (mode === "calculator" || mode === "range") {
      const cidr = parseCidr(networkInput);
      if (!cidr) { networkError = "CIDR を入力してください（例: 192.168.1.20/24）。"; return; }
      if (mode === "range") {
        const details = cidrDetails(cidr);
        networkOutput = [`Network: ${details.network}`, `Range: ${details.network} – ${details.broadcast ?? details.last}`, `Total: ${details.total.toString()} addresses`];
      } else {
        const details = cidrDetails(cidr);
        networkOutput = [`Normalized CIDR: ${formatCidr(cidr)}`, `Network: ${details.network}`, `First host: ${details.first}`, `Last host: ${details.last}`, ...(details.broadcast ? [`Broadcast: ${details.broadcast}`] : []), `Addresses: ${details.total.toString()} / usable: ${details.usable.toString()}`];
      }
      return;
    }
    if (mode === "contains") {
      const cidr = parseCidr(networkInput); const ip = parseIp(networkSecondInput);
      if (!cidr || !ip) { networkError = "CIDR と IP を入力してください。"; return; }
      networkOutput = [ipInCidr(ip, cidr) ? `${ip.normalized} は ${formatCidr(cidr)} に含まれます。` : `${ip.normalized} は ${formatCidr(cidr)} に含まれません。`];
      return;
    }
    if (mode === "split") {
      const cidr = parseCidr(networkInput); const prefix = Number(networkPrefix);
      const output = cidr && Number.isInteger(prefix) ? splitCidr(cidr, prefix) : null;
      if (!output) { networkError = "分割先 prefix は元の CIDR 以上で、最大 4,096 subnet までです。"; return; }
      networkOutput = output.map(formatCidr); return;
    }
    if (mode === "merge") {
      const cidrs = networkInput.split(/[\s,]+/).filter(Boolean).map(parseCidr);
      const output = cidrs.every(Boolean) ? mergeCidrs(cidrs as NonNullable<typeof cidrs[number]>[]) : null;
      if (!output) { networkError = "同じ IP バージョンの有効な CIDR を入力してください。"; return; }
      networkOutput = output.map(formatCidr); return;
    }
    if (mode === "range-to-cidr") {
      const start = parseIp(networkInput);
      const end = parseIp(networkSecondInput);
      const output = start && end ? rangeToCidrs(start, end) : null;
      if (!output) { networkError = "同じ IP バージョンの開始 IP と終了 IP を入力してください。"; return; }
      networkOutput = output.map(formatCidr);
    }
  }

  async function runBulkLookup(): Promise<void> {
    bulkResults = [];
    if (!cleaned.valid.length) return;
    bulkBusy = true;
    const candidates = cleaned.valid.filter((ip) => classifyIp(ip) === "public");
    const local = cleaned.valid.filter((ip) => classifyIp(ip) !== "public").map((ip) => ({ ip, error: `${categoryLabels[classifyIp(ip)]}: API 呼び出し対象外` }));
    const results: Array<{ ip: ParsedIp; result?: PublicIpInfo; error?: string }> = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const ip = candidates[cursor++];
        try { results.push({ ip, result: await lookupPublicIp(ip.normalized) }); }
        catch (error) { results.push({ ip, error: error instanceof Error ? error.message : "Lookup failed" }); }
      }
    });
    await Promise.all(workers);
    bulkResults = [...local, ...results].sort((a, b) => a.ip.normalized.localeCompare(b.ip.normalized));
    bulkBusy = false;
  }

  async function copy(value: string): Promise<void> { await navigator.clipboard?.writeText(value); }

  onMount(() => calculateNetwork());
</script>

<svelte:head><title>IP Toolkit — uft</title><meta name="description" content="Local-first IPv4 and IPv6 inspection, network calculation, conversion, and ipwhois.io lookup." /></svelte:head>

<main class="ip-page">
  <header class="ip-topbar"><a class="ip-home" href="/" aria-label="UFT ホーム"><span class="brand-mark">u</span><span>uft</span></a><span>IP TOOLKIT</span></header>
  <section class="ip-hero"><p class="ip-eyebrow">LOCAL-FIRST NETWORK UTILITIES</p><h1>IP Toolkit</h1><p>IPv4 / IPv6 の判定・計算・変換はブラウザ内で完結します。Public IP の国・ASN 情報だけを ipwhois.io に照会します。</p></section>
  <section class="ip-toolbox" aria-label="IP Toolkit">
    <nav class="ip-tabs" aria-label="機能カテゴリ">{#each Object.entries(labels) as [id, label]}<button class:active={section === id} onclick={() => section = id as Section}>{label}</button>{/each}</nav>
    <p class="ip-note">Public IP の Lookup には <a href="https://ipwhois.io/" target="_blank" rel="noreferrer">ipwhois.io</a> を利用します（API トークン不要）。</p>

    {#if section === "lookup"}
      <section class="ip-panel"><div class="ip-panel-heading"><div><p class="ip-eyebrow">LOOKUP</p><h2>My IP / IP Lookup / ASN Lookup</h2><p>IP を入力して Country と ASN を確認します。ASN Lookup は Public IP から所属 ASN を返します。</p></div><button class="ip-secondary" onclick={lookupMyIp} disabled={lookupBusy}><Globe2 aria-hidden="true" /> My IP</button></div><div class="ip-form"><label>IPv4 または IPv6<input bind:value={lookupInput} placeholder="8.8.8.8 または 2001:4860:4860::8888" onkeydown={(event) => event.key === "Enter" && void lookup()} /></label><button class="ip-primary" onclick={() => void lookup()} disabled={lookupBusy}>{#if lookupBusy}<LoaderCircle class="spin" />{:else}<Search />{/if} Lookup</button></div>{#if myIp}<p class="ip-note">検出した Public IP: <code>{myIp}</code></p>{/if}{#if lookupError}<p class="ip-error" role="alert">{lookupError}</p>{/if}{#if lookupResult}{@render LookupResult(lookupResult)}{/if}</section>
    {:else if section === "inspect"}
      <section class="ip-panel"><p class="ip-eyebrow">INSPECT</p><h2>IP Inspector / Private IP Checker / Special IP Checker</h2><div class="ip-form"><label>IP address<input bind:value={inspectorInput} placeholder="192.168.1.1" /></label></div>{#if inspector}<div class="ip-result-grid"><div><small>Normalized</small><code>{inspector.normalized}</code></div><div><small>Version</small><strong>IPv{inspector.family}</strong></div><div><small>Classification</small><strong>{categoryLabels[classifyIp(inspector)]}</strong></div><div><small>API handling</small><strong>{classifyIp(inspector) === "public" ? "Public lookup allowed" : "Kept local"}</strong></div></div>{:else}<p class="ip-error">有効な IPv4 または IPv6 アドレスを入力してください。</p>{/if}</section>
    {:else if section === "network"}
      <section class="ip-panel"><p class="ip-eyebrow">NETWORK</p><h2>CIDR / Subnet tools</h2><div class="ip-mode-buttons">{#each [["calculator", "CIDR Calculator / Subnet Calculator"], ["range", "CIDR → IP Range"], ["contains", "IP in CIDR Checker"], ["split", "CIDR Splitter"], ["merge", "CIDR Merger"], ["range-to-cidr", "IP Range → CIDR"]] as [id, name]}<button class:active={networkMode === id} onclick={() => { networkMode = id; networkOutput = []; networkError = ""; }}>{name}</button>{/each}</div><div class="ip-form network-form"><label>{networkMode === "range-to-cidr" ? "Start IP" : networkMode === "merge" ? "CIDRs (space/comma separated)" : "CIDR"}<input bind:value={networkInput} placeholder={networkMode === "merge" ? "10.0.0.0/25, 10.0.0.128/25" : "192.168.1.20/24"} /></label>{#if networkMode === "contains" || networkMode === "range-to-cidr"}<label>{networkMode === "contains" ? "IP address" : "End IP"}<input bind:value={networkSecondInput} /></label>{/if}{#if networkMode === "split"}<label>New prefix<input bind:value={networkPrefix} inputmode="numeric" /></label>{/if}<button class="ip-primary" onclick={calculateNetwork}>Calculate</button></div>{#if networkError}<p class="ip-error" role="alert">{networkError}</p>{/if}{#if networkOutput.length}{@render OutputList(networkOutput)}{/if}</section>
    {:else if section === "convert"}
      <section class="ip-panel"><p class="ip-eyebrow">CONVERT</p><h2>IPv4 / IPv6 Converter</h2><p>IPv4 は address・integer・binary・hex を自動判別します。</p><div class="ip-form"><label>Value<input bind:value={convertInput} placeholder="192.0.2.1 / 3221225985 / c0000201" /></label></div>{#if conversion}<div class="ip-result-grid conversion-grid"><div><small>Normalized</small><code>{conversion.normalized}</code></div><div><small>Family</small><strong>IPv{conversion.family}</strong></div>{#if conversion.family === 4}<div><small>Integer</small><code>{conversion.value.toString()}</code></div><div><small>Binary</small><code>{ipv4ToBinary(conversion)}</code></div><div><small>Hex</small><code>{ipv4ToHex(conversion)}</code></div><div><small>IPv4-mapped IPv6</small><code>{mappedIpv6(conversion)?.normalized}</code></div>{:else}<div><small>Expanded IPv6</small><code>{expandIpv6(conversion)}</code></div><div><small>Compressed IPv6</small><code>{conversion.normalized}</code></div>{#if mappedIpv4(conversion)}<div><small>Mapped IPv4</small><code>{mappedIpv4(conversion)?.normalized}</code></div>{/if}{/if}</div>{:else}<p class="ip-error">IPv4 / IPv6、32-bit integer、32-bit binary または 8 桁以下の hex を入力してください。</p>{/if}</section>
    {:else}
      <section class="ip-panel"><p class="ip-eyebrow">BULK</p><h2>IP List Cleaner / Multiple IP Lookup / Log IP Extractor</h2><label class="ip-text-label">IP list（最大 100 個。空白・改行・カンマ・セミコロン区切り）<textarea bind:value={bulkInput} placeholder="8.8.8.8&#10;2001:4860:4860::8888&#10;192.168.1.1"></textarea></label><div class="ip-bulk-summary"><span>Valid: {cleaned.valid.length}</span><span>Duplicate: {cleaned.duplicateCount}</span><span>Invalid: {cleaned.invalid.length}</span>{#if cleaned.limited}<span>100 件までに制限</span>{/if}<button class="ip-secondary" onclick={() => bulkInput = cleaned.valid.map((ip) => ip.normalized).join("\n")}>Clean list</button><button class="ip-primary" onclick={() => void runBulkLookup()} disabled={bulkBusy || !cleaned.valid.length}>{#if bulkBusy}<LoaderCircle class="spin" />{/if} Multiple Lookup</button></div>{#if cleaned.invalid.length}<p class="ip-error">無効: {cleaned.invalid.slice(0, 8).join(", ")}{cleaned.invalid.length > 8 ? " …" : ""}</p>{/if}{#if bulkResults.length}<div class="bulk-results">{#each bulkResults as item}<div><code>{item.ip.normalized}</code>{#if item.result}<span>{item.result.country ?? item.result.countryCode ?? "—"} · {item.result.asn ?? "ASN —"} {item.result.asName ?? ""}</span>{:else}<span>{item.error}</span>{/if}</div>{/each}</div>{/if}<hr /><label class="ip-text-label">Log text<textarea bind:value={logInput} placeholder="Paste logs here to extract IPv4 and IPv6 addresses…"></textarea></label>{#if extracted.length}<div class="ip-bulk-summary"><span>{extracted.length} IP を抽出</span><button class="ip-secondary" onclick={() => void copy(extracted.map((ip) => ip.normalized).join("\n"))}><Copy /> Copy extracted IPs</button></div>{@render OutputList(extracted.map((ip) => `${ip.normalized} (${categoryLabels[classifyIp(ip)]})`))}{:else if logInput}<p class="ip-note">有効な IP アドレスは見つかりませんでした。</p>{/if}</section>
    {/if}
  </section>
</main>

{#snippet LookupResult(result: PublicIpInfo)}
  <div class="ip-result-grid"><div><small>IP</small><code>{result.ip}</code></div><div><small>Country</small><strong>{result.country ?? result.countryCode ?? "—"}</strong></div><div><small>Continent</small><strong>{result.continent ?? result.continentCode ?? "—"}</strong></div><div><small>ASN</small><strong>{result.asn ?? "—"}</strong></div><div><small>ASN name</small><strong>{result.asName ?? "—"}</strong></div><div><small>ASN domain</small><strong>{result.asDomain ?? "—"}</strong></div></div>
{/snippet}

{#snippet OutputList(values: string[])}
  <div class="ip-output"><div><span>Result</span><button aria-label="結果をコピー" onclick={() => void copy(values.join("\n"))}><Copy aria-hidden="true" /></button></div><pre>{values.join("\n")}</pre></div>
{/snippet}
