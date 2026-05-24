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
      fetchTickers: true,
      createOrder: true
    },
    loadMarkets: vi.fn().mockResolvedValue({
      "BTC/USDT": { symbol: "BTC/USDT", active: true }
    }),
    fetchTicker: vi.fn().mockResolvedValue({ symbol: "BTC/USDT", last: 100 }),
    fetchTickers: vi.fn().mockResolvedValue({}),
    fetchAccounts: vi.fn().mockResolvedValue([{ id: "account-1", type: "spot" }]),
    fetchPositions: vi.fn().mockResolvedValue([{ symbol: "BTC/USDT", contracts: 1 }]),
    fetchMyTrades: vi.fn().mockResolvedValue([{ id: "trade-1" }]),
    createTriggerOrder: vi.fn().mockResolvedValue({ id: "trigger-1" }),
    createStopLossOrder: vi.fn().mockResolvedValue({ id: "stop-loss-1" }),
    createTakeProfitOrder: vi.fn().mockResolvedValue({ id: "take-profit-1" }),
    fapiPrivateGetOpenAlgoOrders: vi.fn().mockResolvedValue({ orders: [] }),
    fapiPrivatePostAlgoOrder: vi.fn().mockResolvedValue({ algoId: "algo-1", algoStatus: "NEW" }),
    fapiPrivateDeleteAlgoOrder: vi.fn().mockResolvedValue({ algoId: "algo-1", algoStatus: "CANCELED" }),
    fapiPrivateDeleteAlgoOpenOrders: vi.fn().mockResolvedValue({ code: "200", msg: "done" }),
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
      "ccxt_cancel_algo_order",
      "ccxt_cancel_all_algo_orders",
      "ccxt_fetch_ticker_summary",
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

  it("cancels a Binance futures algo order through the explicit algo API", async () => {
    const exchange = { ...createFakeExchange(), id: "binance" };
    const handlers = createToolHandlers(
      { ...config, exchangeId: "binance", defaultType: "future", enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_cancel_algo_order({
      symbol: "BANANAS31/USDT:USDT",
      algoId: "3000001623568570",
      params: { recvWindow: 5000 }
    });

    expect(result).toEqual({ algoId: "algo-1", algoStatus: "CANCELED" });
    expect(exchange.fapiPrivateDeleteAlgoOrder).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      algoId: "3000001623568570",
      recvWindow: 5000
    });
    expect(exchange.fapiPrivateDeleteAlgoOpenOrders).not.toHaveBeenCalled();
  });

  it("cancels all Binance futures open algo orders for a symbol", async () => {
    const exchange = { ...createFakeExchange(), id: "binance" };
    const handlers = createToolHandlers(
      { ...config, exchangeId: "binance", defaultType: "future", enableTrading: true, dryRun: false },
      () => exchange
    );

    const result = await handlers.ccxt_cancel_all_algo_orders({
      symbol: "BANANAS31/USDT:USDT",
      params: { recvWindow: 5000 }
    });

    expect(result).toEqual({ code: "200", msg: "done" });
    expect(exchange.fapiPrivateDeleteAlgoOpenOrders).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      recvWindow: 5000
    });
    expect(exchange.fapiPrivateDeleteAlgoOrder).not.toHaveBeenCalled();
  });

  it("summarizes futures tickers without returning the full ticker payload", async () => {
    const exchange = createFakeExchange();
    exchange.loadMarkets.mockResolvedValue({
      "BTC/USDT:USDT": {
        symbol: "BTC/USDT:USDT",
        base: "BTC",
        quote: "USDT",
        settle: "USDT",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      },
      "HOT/USDT:USDT": {
        symbol: "HOT/USDT:USDT",
        base: "HOT",
        quote: "USDT",
        settle: "USDT",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      },
      "COLD/USDT:USDT": {
        symbol: "COLD/USDT:USDT",
        base: "COLD",
        quote: "USDT",
        settle: "USDT",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      },
      "USDC/USDT:USDT": {
        symbol: "USDC/USDT:USDT",
        base: "USDC",
        quote: "USDT",
        settle: "USDT",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      },
      "AAPL/USDT:USDT": {
        symbol: "AAPL/USDT:USDT",
        base: "AAPL",
        quote: "USDT",
        settle: "USDT",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      },
      "ETH/USDC:USDC": {
        symbol: "ETH/USDC:USDC",
        base: "ETH",
        quote: "USDC",
        settle: "USDC",
        active: true,
        contract: true,
        swap: true,
        linear: true,
        info: { contractStatus: "TRADING" }
      }
    });
    exchange.fetchTickers.mockResolvedValue({
      "BTC/USDT:USDT": {
        symbol: "BTC/USDT:USDT",
        last: 100,
        percentage: 1.25,
        quoteVolume: 1_500_000,
        timestamp: 123
      },
      "HOT/USDT:USDT": {
        symbol: "HOT/USDT:USDT",
        last: 2,
        percentage: 35,
        quoteVolume: 2_500_000,
        timestamp: 123
      },
      "COLD/USDT:USDT": {
        symbol: "COLD/USDT:USDT",
        last: 0.5,
        percentage: -25,
        quoteVolume: 3_500_000,
        timestamp: 123
      },
      "USDC/USDT:USDT": {
        symbol: "USDC/USDT:USDT",
        last: 1,
        percentage: 0.01,
        quoteVolume: 10_000_000,
        timestamp: 123
      },
      "AAPL/USDT:USDT": {
        symbol: "AAPL/USDT:USDT",
        last: 250,
        percentage: 10,
        quoteVolume: 9_000_000,
        timestamp: 123
      },
      "ETH/USDC:USDC": {
        symbol: "ETH/USDC:USDC",
        last: 2000,
        percentage: 5,
        quoteVolume: 8_000_000,
        timestamp: 123
      }
    });
    const handlers = createToolHandlers(config, () => exchange);

    const result = await handlers.ccxt_fetch_ticker_summary({
      maxItems: 2,
      minQuoteVolume: 1_000_000,
      params: { type: "future" }
    });

    expect(result).toEqual({
      generatedAt: 123456,
      filters: {
        quote: "USDT",
        settle: "USDT",
        linear: true,
        swap: true,
        active: true,
        minQuoteVolume: 1_000_000,
        maxItems: 2,
        excludeStableBases: true,
        excludeNonCryptoBases: true
      },
      universe: {
        markets: 6,
        eligibleMarkets: 3,
        tickers: 6,
        summarizedTickers: 3,
        excluded: {
          ineligibleMarket: 1,
          stableBase: 1,
          nonCryptoBase: 1,
          belowMinQuoteVolume: 0,
          missingTickerFields: 0
        }
      },
      longTop: [
        {
          symbol: "HOT/USDT:USDT",
          base: "HOT",
          last: 2,
          percentage: 35,
          quoteVolume: 2_500_000,
          timestamp: 123,
          tags: ["overheated>=30%"]
        },
        {
          symbol: "BTC/USDT:USDT",
          base: "BTC",
          last: 100,
          percentage: 1.25,
          quoteVolume: 1_500_000,
          timestamp: 123,
          tags: []
        }
      ],
      shortTop: [
        {
          symbol: "COLD/USDT:USDT",
          base: "COLD",
          last: 0.5,
          percentage: -25,
          quoteVolume: 3_500_000,
          timestamp: 123,
          tags: ["overcold<=-20%"]
        }
      ],
      liquidityTop: [
        {
          symbol: "COLD/USDT:USDT",
          base: "COLD",
          last: 0.5,
          percentage: -25,
          quoteVolume: 3_500_000,
          timestamp: 123,
          tags: ["overcold<=-20%"]
        },
        {
          symbol: "HOT/USDT:USDT",
          base: "HOT",
          last: 2,
          percentage: 35,
          quoteVolume: 2_500_000,
          timestamp: 123,
          tags: ["overheated>=30%"]
        }
      ],
      seedSymbols: ["HOT/USDT:USDT", "BTC/USDT:USDT", "COLD/USDT:USDT"]
    });
    expect(exchange.loadMarkets).toHaveBeenCalledWith(false);
    expect(exchange.fetchTickers).toHaveBeenCalledWith(undefined, { type: "future" });
    expect(exchange.createOrder).not.toHaveBeenCalled();
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

  it("replaces duplicate Binance futures close-position stop-loss algo orders when explicitly requested", async () => {
    const existingOrder = {
      algoId: "existing-sl",
      symbol: "BANANAS31USDT",
      side: "BUY",
      positionSide: "SHORT",
      orderType: "STOP_MARKET",
      triggerPrice: "0.010500",
      closePosition: true,
      algoStatus: "NEW"
    };
    const exchange = { ...createFakeExchange(), id: "binance" };
    exchange.fapiPrivateGetOpenAlgoOrders.mockResolvedValue({ orders: [existingOrder] });
    exchange.fapiPrivateDeleteAlgoOrder.mockResolvedValue({ algoId: "existing-sl", algoStatus: "CANCELED" });
    exchange.fapiPrivatePostAlgoOrder.mockResolvedValue({ algoId: "new-sl", algoStatus: "NEW" });
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
        replaceExistingClosePosition: true,
        workingType: "MARK_PRICE",
        recvWindow: 5000
      }
    });

    const expectedNewOrderPayload = {
      algoType: "CONDITIONAL",
      symbol: "BANANAS31USDT",
      side: "BUY",
      type: "STOP_MARKET",
      triggerPrice: "0.010619",
      positionSide: "SHORT",
      workingType: "MARK_PRICE",
      recvWindow: 5000,
      closePosition: "true"
    };
    expect(result).toEqual({
      replaced: true,
      exchange: "binance",
      canceledOrder: { algoId: "existing-sl", algoStatus: "CANCELED" },
      newOrder: { algoId: "new-sl", algoStatus: "NEW" },
      replacedExistingOrder: existingOrder,
      params: expectedNewOrderPayload
    });
    expect(exchange.fapiPrivateDeleteAlgoOrder).toHaveBeenCalledWith({
      symbol: "BANANAS31USDT",
      algoId: "existing-sl",
      recvWindow: 5000
    });
    expect(exchange.fapiPrivatePostAlgoOrder).toHaveBeenCalledWith(expectedNewOrderPayload);
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
