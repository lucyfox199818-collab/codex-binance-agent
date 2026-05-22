import { describe, expect, it } from "vitest";

import type { CcxtMcpConfig } from "../src/config.js";
import { createExchange } from "../src/exchange-factory.js";

class FakeExchange {
  public readonly id = "fake";
  public apiKey?: string;
  public secret?: string;
  public password?: string;
  public timeout?: number;
  public proxy?: string;
  public httpProxy?: string;
  public httpsProxy?: string;
  public socksProxy?: string;
  public sandboxMode?: boolean;
  public options?: Record<string, unknown>;
  public enableRateLimit?: boolean;

  public constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
  }

  public setSandboxMode(value: boolean): void {
    this.sandboxMode = value;
  }
}

const baseConfig: CcxtMcpConfig = {
  exchangeId: "fake",
  apiKey: "key",
  secret: "secret",
  password: "password",
  proxyUrl: "socks5://127.0.0.1:1080",
  sandbox: true,
  defaultType: "future",
  enableTrading: false,
  dryRun: true,
  timeoutMs: 30000,
  ipCheckUrl: "https://api.ipify.org?format=json"
};

describe("createExchange", () => {
  it("creates an exchange with credentials, default market type, proxy, and sandbox mode", () => {
    const exchange = createExchange(baseConfig, { fake: FakeExchange });

    expect(exchange.apiKey).toBe("key");
    expect(exchange.secret).toBe("secret");
    expect(exchange.password).toBe("password");
    expect(exchange.enableRateLimit).toBe(true);
    expect(exchange.timeout).toBe(30000);
    expect(exchange.options).toEqual({ defaultType: "future" });
    expect(exchange.proxy).toBeUndefined();
    expect(exchange.httpProxy).toBeUndefined();
    expect(exchange.httpsProxy).toBeUndefined();
    expect(exchange.socksProxy).toBe("socks5://127.0.0.1:1080");
    expect(exchange.sandboxMode).toBe(true);
  });

  it("suppresses Binance all-symbol open-order warnings for account preflight reads", () => {
    const exchange = createExchange(
      { ...baseConfig, exchangeId: "binance" },
      { binance: FakeExchange }
    );

    expect(exchange.options).toMatchObject({
      defaultType: "future",
      warnOnFetchOpenOrdersWithoutSymbol: false
    });
  });

  it("maps HTTP and HTTPS proxy URLs to the single matching CCXT proxy field", () => {
    const httpExchange = createExchange(
      { ...baseConfig, proxyUrl: "http://127.0.0.1:7890", sandbox: false },
      { fake: FakeExchange }
    );
    const httpsExchange = createExchange(
      { ...baseConfig, proxyUrl: "https://127.0.0.1:7890", sandbox: false },
      { fake: FakeExchange }
    );

    expect(httpExchange.httpProxy).toBe("http://127.0.0.1:7890");
    expect(httpExchange.httpsProxy).toBeUndefined();
    expect(httpExchange.socksProxy).toBeUndefined();
    expect(httpsExchange.httpsProxy).toBe("https://127.0.0.1:7890");
    expect(httpsExchange.httpProxy).toBeUndefined();
    expect(httpsExchange.socksProxy).toBeUndefined();
  });

  it("fails clearly for unknown exchanges", () => {
    expect(() => createExchange({ ...baseConfig, exchangeId: "missing" }, {})).toThrow(
      /Unsupported CCXT exchange/
    );
  });
});
