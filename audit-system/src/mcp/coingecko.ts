type JsonRecord = Record<string, unknown>;

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export interface CoinGeckoRequestOptions {
  baseUrl?: string;
  apiKey?: string;
}

function clamp(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(max, Math.floor(value)))
    : fallback;
}

function addIfDefined(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  params.set(key, String(value));
}

async function fetchCoinGecko(path: string, params: URLSearchParams, options: CoinGeckoRequestOptions = {}): Promise<unknown> {
  const baseUrl = options.baseUrl ?? COINGECKO_BASE_URL;
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "codex-binance-agent/0.1"
  };
  if (options.apiKey) {
    headers["x-cg-demo-api-key"] = options.apiKey;
  }

  const response = await fetch(url, { headers });
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
      source: "coingecko-public",
      freeOnly: !options.apiKey,
      error: parsed
    };
  }
  return {
    ok: true,
    status: response.status,
    source: "coingecko-public",
    freeOnly: !options.apiKey,
    data: parsed
  };
}

export async function coingeckoSearch(args: JsonRecord = {}, options: CoinGeckoRequestOptions = {}): Promise<unknown> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) {
    throw new Error("coingecko_search requires query.");
  }
  const params = new URLSearchParams();
  params.set("query", query);
  return await fetchCoinGecko("/search", params, options);
}

export async function coingeckoTrending(_args: JsonRecord = {}, options: CoinGeckoRequestOptions = {}): Promise<unknown> {
  return await fetchCoinGecko("/search/trending", new URLSearchParams(), options);
}

export async function coingeckoMarkets(args: JsonRecord = {}, options: CoinGeckoRequestOptions = {}): Promise<unknown> {
  const params = new URLSearchParams();
  addIfDefined(params, "vs_currency", typeof args.vsCurrency === "string" ? args.vsCurrency : "usd");
  addIfDefined(params, "ids", Array.isArray(args.ids) ? args.ids.join(",") : args.ids);
  addIfDefined(params, "category", args.category);
  addIfDefined(params, "order", typeof args.order === "string" ? args.order : "market_cap_desc");
  addIfDefined(params, "per_page", clamp(args.perPage, 50, 250));
  addIfDefined(params, "page", clamp(args.page, 1, 100));
  addIfDefined(params, "sparkline", args.sparkline === true ? "true" : "false");
  addIfDefined(params, "price_change_percentage", args.priceChangePercentage);
  return await fetchCoinGecko("/coins/markets", params, options);
}
