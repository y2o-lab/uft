import { describe, expect, it } from "vitest";
import {
  type Cidr,
  cidrDetails,
  classifyIp,
  cleanIpList,
  expandIpv6,
  extractIps,
  formatCidr,
  ipv4ToBinary,
  mappedIpv4,
  mappedIpv6,
  mergeCidrs,
  type ParsedIp,
  parseCidr,
  parseIp,
  rangeToCidrs,
  splitCidr,
} from "./ip";

function ip(input: string): ParsedIp {
  const parsed = parseIp(input);
  if (!parsed) throw new Error(`Expected valid IP: ${input}`);
  return parsed;
}

function cidr(input: string): Cidr {
  const parsed = parseCidr(input);
  if (!parsed) throw new Error(`Expected valid CIDR: ${input}`);
  return parsed;
}

describe("IP toolkit primitives", () => {
  it("normalizes IPv4 and IPv6", () => {
    expect(parseIp("001.002.003.004")?.normalized).toBe("1.2.3.4");
    const ipv6 = ip("2001:0db8:0:0:0:0:0:1");
    expect(ipv6.normalized).toBe("2001:db8::1");
    expect(expandIpv6(ipv6)).toBe("2001:0db8:0000:0000:0000:0000:0000:0001");
  });
  it("classifies special addresses without an API", () => {
    expect(classifyIp(ip("10.1.2.3"))).toBe("private");
    expect(classifyIp(ip("203.0.113.2"))).toBe("documentation");
    expect(classifyIp(ip("8.8.8.8"))).toBe("public");
  });
  it("calculates CIDR details and relationships", () => {
    const network = cidr("192.168.1.20/24");
    expect(formatCidr(network)).toBe("192.168.1.0/24");
    expect(cidrDetails(network)).toMatchObject({
      first: "192.168.1.1",
      last: "192.168.1.254",
      broadcast: "192.168.1.255",
      total: 256n,
    });
    expect(splitCidr(network, 25)?.map(formatCidr)).toEqual([
      "192.168.1.0/25",
      "192.168.1.128/25",
    ]);
    expect(formatCidr(cidr("2001:db8::1/64"))).toBe("2001:db8::/64");
  });
  it("merges and summarizes exact ranges", () => {
    expect(
      mergeCidrs([cidr("10.0.0.0/25"), cidr("10.0.0.128/25")])?.map(formatCidr),
    ).toEqual(["10.0.0.0/24"]);
    expect(
      rangeToCidrs(ip("10.0.0.1"), ip("10.0.0.6"))?.map(formatCidr),
    ).toEqual(["10.0.0.1/32", "10.0.0.2/31", "10.0.0.4/31", "10.0.0.6/32"]);
  });
  it("converts and extracts safely", () => {
    expect(ipv4ToBinary(ip("192.0.2.1"))).toBe(
      "11000000.00000000.00000010.00000001",
    );
    expect(
      extractIps("from 2001:db8::1 to 192.0.2.1").map((ip) => ip.normalized),
    ).toEqual(["2001:db8::1", "192.0.2.1"]);
    expect(cleanIpList("8.8.8.8 8.8.8.8 nope")).toMatchObject({
      duplicateCount: 1,
      invalid: ["nope"],
    });
    expect(mappedIpv6(ip("192.0.2.1"))?.normalized).toBe("::ffff:192.0.2.1");
    expect(mappedIpv4(ip("::ffff:192.0.2.1"))?.normalized).toBe("192.0.2.1");
  });
});
