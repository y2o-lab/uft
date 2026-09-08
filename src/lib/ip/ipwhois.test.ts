import { describe, expect, it } from "vitest";
import { lookupPublicIp, normalizeIpWhoisResponse } from "./ipwhois";

describe("ipwhois.io adapter", () => {
  it("maps the wire response to a UI-independent model", () => {
    expect(
      normalizeIpWhoisResponse({
        success: true,
        ip: "8.8.8.8",
        connection: { asn: 15169, org: "Google LLC", domain: "google.com" },
        country: "United States",
      }),
    ).toEqual({
      ip: "8.8.8.8",
      asn: "AS15169",
      asName: "Google LLC",
      asDomain: "google.com",
      countryCode: null,
      country: "United States",
      continentCode: null,
      continent: null,
    });
  });

  it("uses the token-free endpoint for an IP lookup", async () => {
    const fetcher: typeof fetch = async (input) => {
      expect(String(input)).toBe("https://ipwho.is/8.8.8.8");
      return new Response(
        JSON.stringify({ success: true, ip: "8.8.8.8", country_code: "US" }),
      );
    };
    await expect(lookupPublicIp("8.8.8.8", fetcher)).resolves.toMatchObject({
      countryCode: "US",
    });
  });

  it("uses the same endpoint without an IP to look up the current address", async () => {
    const fetcher: typeof fetch = async (input) => {
      expect(String(input)).toBe("https://ipwho.is/");
      return new Response(JSON.stringify({ success: true, ip: "203.0.113.1" }));
    };
    await expect(lookupPublicIp("", fetcher)).resolves.toMatchObject({
      ip: "203.0.113.1",
    });
  });

  it("surfaces an application-level API error", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({ success: false, message: "Invalid IP address" }),
      );
    await expect(lookupPublicIp("invalid", fetcher)).rejects.toThrow(
      "ipwhois.io: Invalid IP address",
    );
  });
});
