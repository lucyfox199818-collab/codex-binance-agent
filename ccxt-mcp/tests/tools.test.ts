import { describe, expect, it, vi } from "vitest";

import type { CcxtMcpConfig } from "../src/config.js";
import { createToolHandlers, toolDefinitions } from "../src/tools.js";

const config: CcxtMcpConfig = {
  exchangeId: "fake",
  enableTrading: false,
  dryRun: true,
  timeoutMs: 30000,
  ipCheckUrl: "https://api.ipify.org?format=json",
  whitelistIps: []
};

function createFakeExchange() {
  return {
    id: "fake",
    has: {
      fetchTicker: true,
      createOrder: true
    },
    loadMarkets: vi.fn().mockResolvedValue({
      "BTC/USDT": { symbol: "BTC/USDT", active: true }
    }),
    fetchTicker: vi.fn().mockResolvedValue({ symbol: "BTC/USDT", last: 100 }),
    fetchAccounts: vi.fn().mockResolvedValue([{ id: "account-1", type: "spot" }]),
    fetchPositions: vi.fn().mockResolvedValue([{ symbol: "BTC/USDT", contracts: 1 }]),
    fetchMyTrades: vi.fn().mockResolvedValue([{ id: "trade-1" }]),
    createTriggerOrder: vi.fn().mockResolvedValue({ id: "trigger-1" }),
    createStopLossOrder: vi.fn().mockResolvedValue({ id: "stop-loss-1" }),
    createTakeProfitOrder: vi.fn().mockResolvedValue({ id: "take-profit-1" }),
    fapiPrivateGetOpenAlgoOrders: vi.fn().mockResolvedValue({ orders: [] }),
    fapiPrivatePostAlgoOrder: vi.fn().mockResolvedValue({ algoId: "algo-1", algoStatus: "NEW" }),
    transfer: vi.fn().mockResolvedValue({ id: "transfer-1" }),
    createOrder: vi.fn().mockResolvedValue({ id: "order-1" }),
    fetch: vi.fn().mockResolvedValue({ ip: "203.0.113.1" }),
    milliseconds: vi.fn(() => 123456)
  };
}

describe("createToolHandlers", () => {
  it("registers broad common CCXT tools as explicit MCP tools", () => {
    const toolNames = new Set(toolDefinitions.map((tool) => tool.name));

    for (const expectedTool of [
      "ccxt_fetch_accounts",
      "ccxt_fetch_positions",
      "ccxt_fetch_my_trades",
      "ccxt_fetch_ledger",
      "ccxt_fetch_deposits",
      "ccxt_fetch_withdrawals",
      "ccxt_fetch_funding_rate",
      "ccxt_fetch_open_interest",
      "ccxt_fetch_orders",
      "ccxt_fetch_open_algo_orders",
      "ccxt_create_trigger_order",
      "ccxt_create_stop_loss_order",
      "ccxt_create_take_profit_order",
      "ccxt_create_order_with_take_profit_and_stop_loss",
      "ccxt_create_trailing_amount_order",
      "ccxt_cancel_all_orders",
      "ccxt_edit_order",
      "ccxt_set_leverage",
      "ccxt_set_margin_mode",
      "ccxt_transfer",
      "ccxt_withdraw"
    ]) {
      expect(toolNames.has(expectedTool), expectedTool).toBe(true);
    }
  });

  it("invokes existing CCXT methods through the generic call tool", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_call({
      method: "fetchTicker",
      args: ["BTC/USDT"]
    });

    expect(result).toEqual({ symbol: "BTC/USDT", last: 100 });
    expect(exchange.fetchTicker).toHaveBeenCalledWith("BTC/USDT");
  });

  it("returns a dry-run order when trading is disabled", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_create_order({
      symbol: "BTC/USDT",
      type: "limit",
      side: "buy",
      amount: 0.01,
      price: 50000
    });

    expect(result).toMatchObject({
      dryRun: true,
      wouldCall: "createOrder",
      params: {
        symbol: "BTC/USDT",
        type: "limit",
        side: "buy",
        amount: 0.01,
        price: 50000
      }
    });
    expect(exchange.createOrder).not.toHaveBeenCalled();
  });

  it("places an order only when trading is enabled and dry-run is disabled", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(
      { ...config, enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_create_order({
      symbol: "BTC/USDT",
      type: "market",
      side: "sell",
      amount: 0.02
    });

    expect(result).toEqual({ id: "order-1" });
    expect(exchange.createOrder).toHaveBeenCalledWith("BTC/USDT", "market", "sell", 0.02, undefined, {});
  });

  it("fetches account information through explicit tools", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const accounts = await handlers.ccxt_fetch_accounts({
      params: { type: "spot" }
    });
    const positions = await handlers.ccxt_fetch_positions({
      symbols: ["BTC/USDT"],
      params: { type: "swap" }
    });

    expect(accounts).toEqual([{ id: "account-1", type: "spot" }]);
    expect(positions).toEqual([{ symbol: "BTC/USDT", contracts: 1 }]);
    expect(exchange.fetchAccounts).toHaveBeenCalledWith({ type: "spot" });
    expect(exchange.fetchPositions).toHaveBeenCalledWith(["BTC/USDT"], { type: "swap" });
  });

  it("fetches Binance futures open algo orders through an explicit protection tool", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_fetch_open_algo_orders({
      symbol: "BANANAS31/USDT:USDT",
      params: { algoType: "CONDITIONAL" }
    });

    expect(result).toEqual({ orders: [] });
    expect(exchange.fapiPrivateGetOpenAlgoOrders).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      algoType: "CONDITIONAL"
    });
  });

  it("dry-runs conditional orders when trading is not enabled", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_create_stop_loss_order({
      symbol: "BTC/USDT",
      type: "market",
      side: "sell",
      amount: 0.05,
      stopLossPrice: 48000
    });

    expect(result).toMatchObject({
      dryRun: true,
      wouldCall: "createStopLossOrder"
    });
    expect(exchange.createStopLossOrder).not.toHaveBeenCalled();
  });

  it("places conditional orders when trading is enabled and dry-run is disabled", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(
      { ...config, enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_create_trigger_order({
      symbol: "BTC/USDT",
      type: "limit",
      side: "buy",
      amount: 0.05,
      price: 49000,
      triggerPrice: 50000,
      params: { reduceOnly: true }
    });

    expect(result).toEqual({ id: "trigger-1" });
    expect(exchange.createTriggerOrder).toHaveBeenCalledWith(
      "BTC/USDT",
      "limit",
      "buy",
      0.05,
      49000,
      50000,
      { reduceOnly: true }
    );
  });

  it("routes Binance futures stop-loss close-position orders through the Algo Order API", async () => {
    const exchange = { ...createFakeExchange(), id: "binance" };
    const handlers = createToolHandlers(
      { ...config, exchangeId: "binance", defaultType: "future", enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_create_stop_loss_order({
      symbol: "BANANAS31/USDT:USDT",
      type: "market",
      side: "buy",
      amount: 5632,
      stopLossPrice: 0.010619,
      params: {
        positionSide: "SHORT",
        closePosition: true,
        workingType: "MARK_PRICE"
      }
    });

    expect(result).toEqual({ algoId: "algo-1", algoStatus: "NEW" });
    expect(exchange.fapiPrivateGetOpenAlgoOrders).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      algoType: "CONDITIONAL"
    });
    expect(exchange.fapiPrivatePostAlgoOrder).toHaveBeenCalledWith({
      algoType: "CONDITIONAL",
      symbol: "BANANAS31USDT",
      side: "BUY",
      positionSide: "SHORT",
      type: "STOP_MARKET",
      triggerPrice: "0.010619",
      closePosition: "true",
      workingType: "MARK_PRICE"
    });
    expect(exchange.createStopLossOrder).not.toHaveBeenCalled();
  });

  it("skips duplicate Binance futures close-position stop-loss algo orders", async () => {
    const existingOrder = {
      algoId: "existing-sl",
      symbol: "BANANAS31USDT",
      side: "BUY",
      positionSide: "SHORT",
      orderType: "STOP_MARKET",
      closePosition: true,
      algoStatus: "NEW"
    };
    const exchange = { ...createFakeExchange(), id: "binance" };
    exchange.fapiPrivateGetOpenAlgoOrders.mockResolvedValue({ orders: [existingOrder] });
    const handlers = createToolHandlers(
      { ...config, exchangeId: "binance", defaultType: "future", enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_create_stop_loss_order({
      symbol: "BANANAS31/USDT:USDT",
      type: "market",
      side: "buy",
      amount: 5632,
      stopLossPrice: 0.010619,
      params: {
        positionSide: "SHORT",
        closePosition: true,
        workingType: "MARK_PRICE"
      }
    });

    expect(result).toEqual({
      duplicate: true,
      exchange: "binance",
      reason: "Matching Binance futures close-position algo order already exists",
      wouldCall: "fapiPrivatePostAlgoOrder",
      params: {
        algoType: "CONDITIONAL",
        symbol: "BANANAS31USDT",
        side: "BUY",
        type: "STOP_MARKET",
        triggerPrice: "0.010619",
        positionSide: "SHORT",
        workingType: "MARK_PRICE",
        closePosition: "true"
      },
      existingOrder
    });
    expect(exchange.fapiPrivatePostAlgoOrder).not.toHaveBeenCalled();
    expect(exchange.createStopLossOrder).not.toHaveBeenCalled();
  });

  it("routes Binance futures take-profit close-position orders through the Algo Order API", async () => {
    const exchange = { ...createFakeExchange(), id: "binance" };
    const handlers = createToolHandlers(
      { ...config, exchangeId: "binance", defaultType: "future", enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_create_take_profit_order({
      symbol: "BANANAS31/USDT:USDT",
      type: "market",
      side: "buy",
      amount: 5632,
      takeProfitPrice: 0.01005,
      params: {
        positionSide: "SHORT",
        closePosition: true,
        workingType: "MARK_PRICE"
      }
    });

    expect(result).toEqual({ algoId: "algo-1", algoStatus: "NEW" });
    expect(exchange.fapiPrivateGetOpenAlgoOrders).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      algoType: "CONDITIONAL"
    });
    expect(exchange.fapiPrivatePostAlgoOrder).toHaveBeenCalledWith({
      algoType: "CONDITIONAL",
      symbol: "BANANAS31USDT",
      side: "BUY",
      positionSide: "SHORT",
      type: "TAKE_PROFIT_MARKET",
      triggerPrice: "0.01005",
      closePosition: "true",
      workingType: "MARK_PRICE"
    });
    expect(exchange.createTakeProfitOrder).not.toHaveBeenCalled();
  });

  it("dry-runs transfer-style account mutations when trading is not enabled", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_transfer({
      code: "USDT",
      amount: 10,
      fromAccount: "spot",
      toAccount: "future"
    });

    expect(result).toMatchObject({
      dryRun: true,
      wouldCall: "transfer"
    });
    expect(exchange.transfer).not.toHaveBeenCalled();
  });

  it("checks whether the observed proxy IP is in the configured whitelist", async () => {
    const exchange = createFakeExchange();
    const handlers = createToolHandlers(
      { ...config, whitelistIps: ["203.0.113.1"] },
      () => exchange
    );

    const result = await handlers.ccxt_proxy_ip();

    expect(result).toEqual({
      ipCheckUrl: "https://api.ipify.org?format=json",
      observedIp: "203.0.113.1",
      whitelistIps: ["203.0.113.1"],
      whitelisted: true,
      response: { ip: "203.0.113.1" }
    });
  });
});
