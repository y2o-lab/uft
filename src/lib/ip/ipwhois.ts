export type PublicIpInfo = {
  ip: string;
  asn: string | null;
  asName: string | null;
  asDomain: string | null;
  countryCode: string | null;
  country: string | null;
  continentCode: string | null;
  continent: string | null;
};

type IpWhoisResponse = {
  success?: unknown;
  message?: unknown;
  ip?: unknown;
  connection?: {
    asn?: unknown;
    org?: unknown;
    domain?: unknown;
  };
  country_code?: unknown;
  country?: unknown;
  continent_code?: unknown;
  continent?: unknown;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asnOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `AS${value}`;
  const asn = stringOrNull(value);
  return asn ? (asn.startsWith("AS") ? asn : `AS${asn}`) : null;
}

export function normalizeIpWhoisResponse(
  payload: IpWhoisResponse,
): PublicIpInfo {
  return {
    ip: stringOrNull(payload.ip) ?? "—",
    asn: asnOrNull(payload.connection?.asn),
    asName: stringOrNull(payload.connection?.org),
    asDomain: stringOrNull(payload.connection?.domain),
    countryCode: stringOrNull(payload.country_code),
    country: stringOrNull(payload.country),
    continentCode: stringOrNull(payload.continent_code),
    continent: stringOrNull(payload.continent),
  };
}

export async function lookupPublicIp(
  ip = "",
  fetcher: typeof fetch = fetch,
): Promise<PublicIpInfo> {
  const response = await fetcher(
    `https://ipwho.is/${ip ? encodeURIComponent(ip) : ""}`,
  );
  if (!response.ok)
    throw new Error(`ipwhois.io の応答エラー (${response.status})`);

  const payload = (await response.json()) as IpWhoisResponse;
  if (payload.success !== true) {
    const message = stringOrNull(payload.message);
    throw new Error(
      message ? `ipwhois.io: ${message}` : "ipwhois.io の照会に失敗しました。",
    );
  }
  return normalizeIpWhoisResponse(payload);
}
