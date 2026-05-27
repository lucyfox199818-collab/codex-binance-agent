type JsonRecord = Record<string, unknown>;

const DEFILLAMA_BASE_URLS = {
  core: "https://api.llama.fi",
  stablecoins: "https://stablecoins.llama.fi",
  yields: "https://yields.llama.fi",
  coins: "https://coins.llama.fi",
  fees: "https://fees.llama.fi"
};

export interface DefiLlamaRequestOptions {
  baseUrls?: Partial<typeof DEFILLAMA_BASE_URLS>;
}

function baseUrl(options: DefiLlamaRequestOptions, key: keyof typeof DEFILLAMA_BASE_URLS): string {
  return options.baseUrls?.[key] ?? DEFILLAMA_BASE_URLS[key];
}

function clamp(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(max, Math.floor(value)))
    : fallback;
}

function stringArg(args: JsonRecord, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function addIfDefined(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  params.set(key, String(value));
}

async function fetchDefiLlama(
  source: keyof typeof DEFILLAMA_BASE_URLS,
  path: string,
  params = new URLSearchParams(),
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const url = new URL(`${baseUrl(options, source)}${path}`);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "codex-binance-agent/0.1"
    }
  });
  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    parsed = body;
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      source: "defillama-public",
      freeOnly: true,
      error: parsed
    };
  }

  return {
    ok: true,
    status: response.status,
    source: "defillama-public",
    freeOnly: true,
    data: parsed
  };
}

export async function defillamaProtocols(
  _args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  return await fetchDefiLlama("core", "/protocols", undefined, options);
}

export async function defillamaProtocol(
  args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const slug = stringArg(args, "slug");
  if (!slug) {
    throw new Error("defillama_protocol requires slug.");
  }
  return await fetchDefiLlama("core", `/protocol/${encodeURIComponent(slug)}`, undefined, options);
}

export async function defillamaStablecoins(
  args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const params = new URLSearchParams();
  addIfDefined(params, "includePrices", args.includePrices === false ? "false" : "true");
  return await fetchDefiLlama("stablecoins", "/stablecoins", params, options);
}

export async function defillamaYieldsPools(
  args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const result = await fetchDefiLlama("yields", "/pools", undefined, options);
  const limit = clamp(args.limit, 1000, 10_000);
  if (!result || typeof result !== "object" || Array.isArray(result) || !(result as JsonRecord).ok) {
    return result;
  }
  const record = result as JsonRecord;
  const payload = record.data as JsonRecord | undefined;
  const data = Array.isArray(payload?.data) ? payload.data.slice(0, limit) : payload?.data;
  return {
    ...record,
    data: payload && Array.isArray(payload.data) ? { ...payload, data } : payload
  };
}

export async function defillamaFeesOverview(
  args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const params = new URLSearchParams();
  addIfDefined(params, "excludeTotalDataChart", args.excludeTotalDataChart === false ? "false" : "true");
  addIfDefined(params, "excludeTotalDataChartBreakdown", args.excludeTotalDataChartBreakdown === false ? "false" : "true");
  addIfDefined(params, "dataType", stringArg(args, "dataType") ?? "dailyFees");
  return await fetchDefiLlama("fees", "/overview/fees", params, options);
}

export async function defillamaPricesCurrent(
  args: JsonRecord = {},
  options: DefiLlamaRequestOptions = {}
): Promise<unknown> {
  const coins = Array.isArray(args.coins)
    ? args.coins.filter((coin): coin is string => typeof coin === "string" && Boolean(coin.trim()))
    : [];
  if (!coins.length) {
    throw new Error("defillama_prices_current requires coins, e.g. [\"coingecko:ethereum\"].");
  }
  return await fetchDefiLlama("coins", `/prices/current/${encodeURIComponent(coins.join(","))}`, undefined, options);
}
