import ccxt from "ccxt";

import type { CcxtMcpConfig } from "./config.js";

export interface ExchangeLike {
  id?: string;
  has?: Record<string, unknown>;
  options?: Record<string, unknown>;
  loadProxyModules?: () => Promise<unknown>;
  setSandboxMode?: (enabled: boolean) => void;
  [key: string]: unknown;
}

export type ExchangeConstructor<T extends ExchangeLike = ExchangeLike> = new (
  options: Record<string, unknown>
) => T;

export type ExchangeRegistry<T extends ExchangeLike = ExchangeLike> = Record<
  string,
  ExchangeConstructor<T> | unknown
>;

const preparedExchanges = new WeakSet<object>();

function applyProxy(exchangeOptions: Record<string, unknown>, proxyUrl: string): void {
  const protocol = new URL(proxyUrl).protocol.toLowerCase();

  if (protocol === "http:") {
    exchangeOptions.httpProxy = proxyUrl;
    return;
  }

  if (protocol === "https:") {
    exchangeOptions.httpsProxy = proxyUrl;
    return;
  }

  if (protocol === "socks:" || protocol === "socks4:" || protocol === "socks5:") {
    exchangeOptions.socksProxy = proxyUrl;
    return;
  }

  throw new Error(`Unsupported proxy URL protocol: ${protocol}`);
}

export function createExchange<T extends ExchangeLike = ExchangeLike>(
  config: CcxtMcpConfig,
  registry: ExchangeRegistry<T> = ccxt as unknown as ExchangeRegistry<T>
): T {
  const ExchangeClass = registry[config.exchangeId];
  if (typeof ExchangeClass !== "function") {
    throw new Error(`Unsupported CCXT exchange: ${config.exchangeId}`);
  }

  const exchangeOptions: Record<string, unknown> = {
    enableRateLimit: true,
    timeout: config.timeoutMs
  };

  if (config.apiKey) {
    exchangeOptions.apiKey = config.apiKey;
  }
  if (config.secret) {
    exchangeOptions.secret = config.secret;
  }
  if (config.password) {
    exchangeOptions.password = config.password;
  }
  const options: Record<string, unknown> = {};
  if (config.defaultType) {
    options.defaultType = config.defaultType;
  }
  if (config.exchangeId === "binance") {
    options.warnOnFetchOpenOrdersWithoutSymbol = false;
  }
  if (Object.keys(options).length > 0) {
    exchangeOptions.options = options;
  }
  if (config.proxyUrl) {
    applyProxy(exchangeOptions, config.proxyUrl);
  }

  const exchange = new (ExchangeClass as ExchangeConstructor<T>)(exchangeOptions);

  if (config.sandbox && typeof exchange.setSandboxMode === "function") {
    exchange.setSandboxMode(true);
  }

  return exchange;
}

export async function prepareExchange(
  exchange: ExchangeLike,
  config: Pick<CcxtMcpConfig, "proxyUrl">
): Promise<void> {
  if (!config.proxyUrl || preparedExchanges.has(exchange)) {
    return;
  }

  if (typeof exchange.loadProxyModules === "function") {
    await exchange.loadProxyModules();
  }

  preparedExchanges.add(exchange);
}

export function listExchangeIds(): string[] {
  const exchanges = (ccxt as unknown as { exchanges?: string[] }).exchanges;
  return Array.isArray(exchanges) ? exchanges : [];
}
