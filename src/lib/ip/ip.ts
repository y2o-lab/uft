export type IpFamily = 4 | 6;

export type ParsedIp = { family: IpFamily; value: bigint; normalized: string };
export type IpCategory =
  | "private"
  | "loopback"
  | "link-local"
  | "multicast"
  | "documentation"
  | "benchmarking"
  | "carrier-grade-nat"
  | "reserved"
  | "unspecified"
  | "public";

export type Cidr = ParsedIp & { prefix: number };
export type IpRange = { family: IpFamily; start: bigint; end: bigint };

const IPV4_BITS = 32;
const IPV6_BITS = 128;
const IPV4_MAX = (1n << 32n) - 1n;
const IPV6_MAX = (1n << 128n) - 1n;

function maxFor(family: IpFamily): bigint {
  return family === 4 ? IPV4_MAX : IPV6_MAX;
}

function bitsFor(family: IpFamily): number {
  return family === 4 ? IPV4_BITS : IPV6_BITS;
}

function mask(family: IpFamily, prefix: number): bigint {
  const bits = bitsFor(family);
  if (prefix === 0) return 0n;
  return ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
}

function toIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 255n))
    .join(".");
}

function parseIpv4(input: string): ParsedIp | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return null;
  const value = octets.reduce(
    (current, octet) => (current << 8n) + BigInt(octet),
    0n,
  );
  return { family: 4, value, normalized: toIpv4(value) };
}

function ipv6Groups(value: bigint): number[] {
  return Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 65535n),
  );
}

export function compressIpv6(value: bigint): string {
  const groups = ipv6Groups(value);
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; ) {
    if (groups[index] !== 0) {
      index++;
      continue;
    }
    const start = index;
    while (index < groups.length && groups[index] === 0) index++;
    if (index - start > bestLength && index - start > 1) {
      bestStart = start;
      bestLength = index - start;
    }
  }
  const hexadecimal = groups.map((group) => group.toString(16));
  if (bestStart < 0) return hexadecimal.join(":");
  const left = hexadecimal.slice(0, bestStart).join(":");
  const right = hexadecimal.slice(bestStart + bestLength).join(":");
  return left && right
    ? `${left}::${right}`
    : left
      ? `${left}::`
      : right
        ? `::${right}`
        : "::";
}

function parseIpv6(input: string): ParsedIp | null {
  let source = input.toLowerCase();
  const zone = source.indexOf("%");
  if (zone >= 0) source = source.slice(0, zone);
  if (!source || source.includes(":::") || source.split("::").length > 2)
    return null;
  const halves = source.split("::");
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const pieces = half.split(":");
    const result: number[] = [];
    for (const piece of pieces) {
      if (piece.includes(".")) {
        const ipv4 = parseIpv4(piece);
        if (!ipv4) return null;
        result.push(
          Number((ipv4.value >> 16n) & 65535n),
          Number(ipv4.value & 65535n),
        );
      } else if (/^[0-9a-f]{1,4}$/.test(piece))
        result.push(Number.parseInt(piece, 16));
      else return null;
    }
    return result;
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
      : left;
  if (groups.length !== 8) return null;
  const value = groups.reduce(
    (current, group) => (current << 16n) + BigInt(group),
    0n,
  );
  return { family: 6, value, normalized: compressIpv6(value) };
}

export function parseIp(input: string): ParsedIp | null {
  const source = input.trim().replace(/^\[|\]$/g, "");
  return parseIpv4(source) ?? parseIpv6(source);
}

export function expandIpv6(ip: ParsedIp): string | null {
  if (ip.family !== 6) return null;
  return ipv6Groups(ip.value)
    .map((group) => group.toString(16).padStart(4, "0"))
    .join(":");
}

function inRange(value: bigint, start: bigint, end: bigint): boolean {
  return value >= start && value <= end;
}

function v4(a: number, b: number, c: number, d: number): bigint {
  return BigInt((((a * 256 + b) * 256 + c) * 256 + d) >>> 0);
}

export function classifyIp(ip: ParsedIp): IpCategory {
  const value = ip.value;
  if (value === 0n) return "unspecified";
  if (ip.family === 4) {
    if (
      inRange(value, v4(10, 0, 0, 0), v4(10, 255, 255, 255)) ||
      inRange(value, v4(172, 16, 0, 0), v4(172, 31, 255, 255)) ||
      inRange(value, v4(192, 168, 0, 0), v4(192, 168, 255, 255))
    )
      return "private";
    if (inRange(value, v4(127, 0, 0, 0), v4(127, 255, 255, 255)))
      return "loopback";
    if (inRange(value, v4(169, 254, 0, 0), v4(169, 254, 255, 255)))
      return "link-local";
    if (inRange(value, v4(224, 0, 0, 0), v4(239, 255, 255, 255)))
      return "multicast";
    if (inRange(value, v4(100, 64, 0, 0), v4(100, 127, 255, 255)))
      return "carrier-grade-nat";
    if (
      inRange(value, v4(192, 0, 2, 0), v4(192, 0, 2, 255)) ||
      inRange(value, v4(198, 51, 100, 0), v4(198, 51, 100, 255)) ||
      inRange(value, v4(203, 0, 113, 0), v4(203, 0, 113, 255))
    )
      return "documentation";
    if (inRange(value, v4(198, 18, 0, 0), v4(198, 19, 255, 255)))
      return "benchmarking";
    if (value >= v4(240, 0, 0, 0)) return "reserved";
    return "public";
  }
  const prefix = (value >> 120n) & 255n;
  if (value === 1n) return "loopback";
  if (prefix === 255n) return "multicast";
  if (value >> 118n === 0b1111111010n) return "link-local"; // fe80::/10
  if (value >> 121n === 0b1111110n) return "private"; // fc00::/7
  if (value >> 96n === 0x20010db8n) return "documentation";
  if (value >> 96n === 0xffffn) return "reserved"; // IPv4-mapped handled locally
  return "public";
}

export function isPublicIp(ip: ParsedIp): boolean {
  return classifyIp(ip) === "public";
}

export function parseCidr(input: string): Cidr | null {
  const [address, rawPrefix, ...rest] = input.trim().split("/");
  if (!address || !rawPrefix || rest.length || !/^\d{1,3}$/.test(rawPrefix))
    return null;
  const ip = parseIp(address);
  const prefix = Number(rawPrefix);
  if (!ip || prefix > bitsFor(ip.family)) return null;
  const value = ip.value & mask(ip.family, prefix);
  return {
    ...ip,
    value,
    normalized: ip.family === 4 ? toIpv4(value) : compressIpv6(value),
    prefix,
  };
}

export function formatCidr(cidr: Cidr): string {
  return `${cidr.normalized}/${cidr.prefix}`;
}

export function cidrRange(cidr: Cidr): IpRange {
  const network = cidr.value & mask(cidr.family, cidr.prefix);
  return {
    family: cidr.family,
    start: network,
    end: network | (maxFor(cidr.family) ^ mask(cidr.family, cidr.prefix)),
  };
}

export function formatIp(value: bigint, family: IpFamily): string {
  return family === 4 ? toIpv4(value) : compressIpv6(value);
}

export function cidrDetails(cidr: Cidr): {
  network: string;
  first: string;
  last: string;
  broadcast: string | null;
  total: bigint;
  usable: bigint;
} {
  const range = cidrRange(cidr);
  const total = range.end - range.start + 1n;
  const network = formatIp(range.start, cidr.family);
  const last = formatIp(range.end, cidr.family);
  if (cidr.family === 4) {
    const usable = cidr.prefix >= 31 ? total : total - 2n;
    return {
      network,
      first: formatIp(cidr.prefix >= 31 ? range.start : range.start + 1n, 4),
      last: formatIp(cidr.prefix >= 31 ? range.end : range.end - 1n, 4),
      broadcast: last,
      total,
      usable,
    };
  }
  return {
    network,
    first: network,
    last,
    broadcast: null,
    total,
    usable: total,
  };
}

export function ipInCidr(ip: ParsedIp, cidr: Cidr): boolean {
  return (
    ip.family === cidr.family &&
    (ip.value & mask(cidr.family, cidr.prefix)) === cidr.value
  );
}

export function splitCidr(
  cidr: Cidr,
  prefix: number,
  maxResults = 4096,
): Cidr[] | null {
  if (prefix < cidr.prefix || prefix > bitsFor(cidr.family)) return null;
  const count = 1n << BigInt(prefix - cidr.prefix);
  if (count > BigInt(maxResults)) return null;
  const step = 1n << BigInt(bitsFor(cidr.family) - prefix);
  return Array.from({ length: Number(count) }, (_, index) => {
    const value = cidr.value + BigInt(index) * step;
    return {
      family: cidr.family,
      value,
      normalized: formatIp(value, cidr.family),
      prefix,
    };
  });
}

export function mergeCidrs(inputs: Cidr[]): Cidr[] | null {
  if (
    !inputs.length ||
    inputs.some((input) => input.family !== inputs[0].family)
  )
    return null;
  const family = inputs[0].family;
  let result = [
    ...new Map(inputs.map((input) => [formatCidr(input), input])).values(),
  ];
  let changed = true;
  while (changed) {
    changed = false;
    result.sort(
      (a, b) =>
        a.prefix - b.prefix ||
        (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    );
    const next: Cidr[] = [];
    for (const cidr of result) {
      const covered = next.some(
        (candidate) =>
          candidate.prefix <= cidr.prefix && ipInCidr(cidr, candidate),
      );
      if (covered) continue;
      const sibling = next.findIndex(
        (candidate) =>
          candidate.prefix === cidr.prefix &&
          candidate.value ===
            (cidr.value ^ (1n << BigInt(bitsFor(family) - cidr.prefix))),
      );
      if (sibling >= 0 && cidr.prefix > 0) {
        next.splice(sibling, 1);
        const value = cidr.value & mask(family, cidr.prefix - 1);
        next.push({
          family,
          value,
          normalized: formatIp(value, family),
          prefix: cidr.prefix - 1,
        });
        changed = true;
      } else next.push(cidr);
    }
    result = next;
  }
  return result.sort((a, b) =>
    a.value < b.value ? -1 : a.value > b.value ? 1 : a.prefix - b.prefix,
  );
}

export function rangeToCidrs(start: ParsedIp, end: ParsedIp): Cidr[] | null {
  if (start.family !== end.family || start.value > end.value) return null;
  const family = start.family;
  const bits = bitsFor(family);
  const result: Cidr[] = [];
  let value = start.value;
  while (value <= end.value) {
    let prefix = bits;
    while (prefix > 0 && (value & (1n << BigInt(bits - prefix))) === 0n)
      prefix--;
    let blockSize = 1n << BigInt(bits - prefix);
    while (value + blockSize - 1n > end.value) {
      prefix++;
      blockSize >>= 1n;
    }
    result.push({ family, value, normalized: formatIp(value, family), prefix });
    value += blockSize;
  }
  return result;
}

export function ipv4ToBinary(ip: ParsedIp): string | null {
  if (ip.family !== 4) return null;
  return [24n, 16n, 8n, 0n]
    .map((shift) =>
      Number((ip.value >> shift) & 255n)
        .toString(2)
        .padStart(8, "0"),
    )
    .join(".");
}

export function ipv4ToHex(ip: ParsedIp): string | null {
  return ip.family === 4 ? `0x${ip.value.toString(16).padStart(8, "0")}` : null;
}

export function mappedIpv6(ip: ParsedIp): ParsedIp | null {
  if (ip.family !== 4) return null;
  const value = (0xffffn << 32n) | ip.value;
  return { family: 6, value, normalized: `::ffff:${ip.normalized}` };
}

export function mappedIpv4(ip: ParsedIp): ParsedIp | null {
  if (ip.family !== 6 || ip.value >> 32n !== 0xffffn) return null;
  const value = ip.value & IPV4_MAX;
  return { family: 4, value, normalized: toIpv4(value) };
}

export function parseIpv4Integer(input: string): ParsedIp | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const value = BigInt(input.trim());
  return value <= IPV4_MAX
    ? { family: 4, value, normalized: toIpv4(value) }
    : null;
}

export function parseIpv4Binary(input: string): ParsedIp | null {
  const normalized = input.trim().replace(/[.\s]/g, "");
  if (!/^[01]{32}$/.test(normalized)) return null;
  const value = BigInt(`0b${normalized}`);
  return { family: 4, value, normalized: toIpv4(value) };
}

export function parseIpv4Hex(input: string): ParsedIp | null {
  const normalized = input.trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]{1,8}$/i.test(normalized)) return null;
  const value = BigInt(`0x${normalized}`);
  return { family: 4, value, normalized: toIpv4(value) };
}

const tokenPattern =
  /(?<![\da-f:])(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[\da-f]{0,4}:){2,}[\da-f:.]*)(?![\da-f:])/gi;

export function extractIps(text: string): ParsedIp[] {
  const found = text.match(tokenPattern) ?? [];
  const seen = new Set<string>();
  return found
    .map(parseIp)
    .filter((ip): ip is ParsedIp => Boolean(ip))
    .filter((ip) => {
      const key = `${ip.family}:${ip.normalized}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function cleanIpList(
  text: string,
  limit = 100,
): {
  valid: ParsedIp[];
  invalid: string[];
  duplicateCount: number;
  limited: boolean;
} {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: ParsedIp[] = [];
  const invalid: string[] = [];
  let duplicateCount = 0;
  for (const part of parts) {
    const ip = parseIp(part);
    if (!ip) {
      invalid.push(part);
      continue;
    }
    const key = `${ip.family}:${ip.normalized}`;
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    if (valid.length < limit) valid.push(ip);
  }
  return { valid, invalid, duplicateCount, limited: seen.size > limit };
}
