import path from "node:path";

import dotenv from "dotenv";

export interface CcxtMcpConfig {
  exchangeId: string;
  apiKey?: string;
  secret?: string;
  password?: string;
  proxyUrl?: string;
  sandbox: boolean;
  defaultType?: string;
  enableTrading: boolean;
  dryRun: boolean;
  timeoutMs: number;
  ipCheckUrl: string;
  whitelistIps: string[];
}

export type Env = Record<string, string | undefined>;

export interface LoadConfigOptions {
  env?: Env;
  envFilePath?: string;
  overrideEnv?: boolean;
}

const DEFAULT_EXCHANGE_ID = "binance";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_IP_CHECK_URL = "https://api.ipify.org?format=json";

function firstNonEmpty(env: Env, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parsePositiveInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value: ${value}`);
  }

  return parsed;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildConfig(env: Env = process.env): CcxtMcpConfig {
  const exchangeId =
    firstNonEmpty(env, ["CCXT_EXCHANGE_ID", "BINANCE_EXCHANGE_ID"]) ?? DEFAULT_EXCHANGE_ID;

  return {
    exchangeId: exchangeId.toLowerCase(),
    apiKey: firstNonEmpty(env, ["CCXT_API_KEY", "BINANCE_API_KEY"]),
    secret: firstNonEmpty(env, ["CCXT_SECRET", "CCXT_API_SECRET", "BINANCE_API_SECRET"]),
    password: firstNonEmpty(env, ["CCXT_PASSWORD", "BINANCE_API_PASSWORD"]),
    proxyUrl: firstNonEmpty(env, [
      "CCXT_PROXY_URL",
      "TRADINGAGENTS_PROXY_URL",
      "HTTPS_PROXY",
      "HTTP_PROXY"
    ]),
    sandbox: parseBoolean(firstNonEmpty(env, ["CCXT_SANDBOX", "BINANCE_SANDBOX"]), false),
    defaultType: firstNonEmpty(env, ["CCXT_DEFAULT_TYPE", "BINANCE_DEFAULT_TYPE"]),
    enableTrading: parseBoolean(firstNonEmpty(env, ["CCXT_ENABLE_TRADING"]), false),
    dryRun: parseBoolean(firstNonEmpty(env, ["CCXT_DRY_RUN"]), true),
    timeoutMs: parsePositiveInteger(firstNonEmpty(env, ["CCXT_TIMEOUT_MS"]), DEFAULT_TIMEOUT_MS),
    ipCheckUrl: firstNonEmpty(env, ["CCXT_IP_CHECK_URL"]) ?? DEFAULT_IP_CHECK_URL,
    whitelistIps: parseList(firstNonEmpty(env, ["CCXT_WHITELIST_IPS", "BINANCE_WHITELIST_IPS"]))
  };
}

export function loadConfig(options: LoadConfigOptions = {}): CcxtMcpConfig {
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? path.resolve(process.cwd(), ".env");

  dotenv.config({
    path: envFilePath,
    override: options.overrideEnv ?? false,
    processEnv: env as Record<string, string>
  });

  return buildConfig(env);
}

export function redactConfig(config: CcxtMcpConfig): Record<string, unknown> {
  return {
    exchangeId: config.exchangeId,
    hasApiKey: Boolean(config.apiKey),
    hasSecret: Boolean(config.secret),
    hasPassword: Boolean(config.password),
    hasProxyUrl: Boolean(config.proxyUrl),
    proxyUrlScheme: config.proxyUrl ? new URL(config.proxyUrl).protocol.replace(":", "") : undefined,
    sandbox: config.sandbox,
    defaultType: config.defaultType,
    enableTrading: config.enableTrading,
    dryRun: config.dryRun,
    timeoutMs: config.timeoutMs,
    ipCheckUrl: config.ipCheckUrl,
    whitelistIpsConfigured: config.whitelistIps.length
  };
}
