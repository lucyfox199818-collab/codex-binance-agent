import { describe, expect, it } from "vitest";

import { buildConfig } from "../src/config.js";

describe("buildConfig", () => {
  it("maps Binance and proxy aliases from the existing .env shape", () => {
    const config = buildConfig({
      TRADINGAGENTS_PROXY_URL: "http://127.0.0.1:7890",
      BINANCE_API_KEY: "binance-key",
      BINANCE_API_SECRET: "binance-secret"
    });

    expect(config.exchangeId).toBe("binance");
    expect(config.proxyUrl).toBe("http://127.0.0.1:7890");
    expect(config.apiKey).toBe("binance-key");
    expect(config.secret).toBe("binance-secret");
  });

  it("defaults live trading off and dry-run on", () => {
    const config = buildConfig({});

    expect(config.enableTrading).toBe(false);
    expect(config.dryRun).toBe(true);
  });

  it("allows explicit trading and exchange settings", () => {
    const config = buildConfig({
      CCXT_EXCHANGE_ID: "okx",
      CCXT_ENABLE_TRADING: "true",
      CCXT_DRY_RUN: "false",
      CCXT_SANDBOX: "true",
      CCXT_DEFAULT_TYPE: "swap",
      CCXT_TIMEOUT_MS: "45000"
    });

    expect(config.exchangeId).toBe("okx");
    expect(config.enableTrading).toBe(true);
    expect(config.dryRun).toBe(false);
    expect(config.sandbox).toBe(true);
    expect(config.defaultType).toBe("swap");
    expect(config.timeoutMs).toBe(45000);
  });

  it("parses optional Binance whitelist IP variables", () => {
    const config = buildConfig({
      BINANCE_WHITELIST_IPS: "203.0.113.1, 203.0.113.2"
    });

    expect(config.whitelistIps).toEqual(["203.0.113.1", "203.0.113.2"]);
  });
});
