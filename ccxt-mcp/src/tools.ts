import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CcxtMcpConfig } from "./config.js";
import { redactConfig } from "./config.js";
import type { ExchangeLike } from "./exchange-factory.js";
import { listExchangeIds, prepareExchange } from "./exchange-factory.js";

type JsonRecord = Record<string, unknown>;
type ToolHandler = (args?: JsonRecord) => Promise<unknown>;

export type ToolHandlers = Record<string, ToolHandler>;
export type ExchangeProvider = () => ExchangeLike;

export interface CcxtToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

const emptySchema = {};
const paramsSchema = z.record(z.string(), z.unknown()).optional();
const symbolsSchema = z.array(z.string()).optional();
const sinceSchema = z.number().int().nonnegative().optional();
const limitSchema = z.number().int().positive().optional();
const maxItemsSchema = z.number().int().positive().max(50).optional();
const minQuoteVolumeSchema = z.number().nonnegative().optional();
const codesSchema = z.array(z.string()).optional();
const codeSchema = z.string().min(1);
const idSchema = z.string().min(1);
const algoIdSchema = z.string().min(1);
const binanceDerivativesPeriodSchema = z
  .enum(["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"])
  .optional();
const sideSchema = z.enum(["buy", "sell"]);
const amountSchema = z.number().positive();
const priceSchema = z.number().positive().optional();
const ordersSchema = z.array(z.record(z.string(), z.unknown()));
const orderRequestsSchema = z.array(z.record(z.string(), z.unknown()));
const symbolParamsSchema = {
  symbol: z.string().min(1),
  params: paramsSchema
};
const optionalSymbolSinceLimitParamsSchema = {
  symbol: z.string().min(1).optional(),
  since: sinceSchema,
  limit: limitSchema,
  params: paramsSchema
};
const symbolsParamsSchema = {
  symbols: symbolsSchema,
  params: paramsSchema
};
const codeSinceLimitParamsSchema = {
  code: codeSchema.optional(),
  since: sinceSchema,
  limit: limitSchema,
  params: paramsSchema
};
const orderCoreSchema = {
  symbol: z.string().min(1),
  type: z.string().min(1),
  side: sideSchema,
  amount: amountSchema,
  price: priceSchema,
  params: paramsSchema
};

export const toolDefinitions: CcxtToolDefinition[] = [
  {
    name: "ccxt_get_config",
    title: "Get CCXT MCP Config",
    description: "Return non-secret server configuration, including trading gate and proxy presence.",
    inputSchema: emptySchema
  },
  {
    name: "ccxt_list_exchanges",
    title: "List CCXT Exchanges",
    description: "List exchange IDs supported by the installed CCXT package.",
    inputSchema: emptySchema
  },
  {
    name: "ccxt_exchange_info",
    title: "Get Exchange Info",
    description: "Return metadata and capability flags for the configured exchange.",
    inputSchema: emptySchema
  },
  {
    name: "ccxt_proxy_ip",
    title: "Check Proxy IP",
    description: "Fetch the configured IP check URL through the CCXT exchange fetch path.",
    inputSchema: emptySchema
  },
  {
    name: "ccxt_load_markets",
    title: "Load Markets",
    description: "Call exchange.loadMarkets(reload, params).",
    inputSchema: {
      reload: z.boolean().optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_ticker",
    title: "Fetch Ticker",
    description: "Call exchange.fetchTicker(symbol, params).",
    inputSchema: {
      symbol: z.string().min(1),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_tickers",
    title: "Fetch Tickers",
    description: "Call exchange.fetchTickers(symbols, params). Omit symbols for exchange default.",
    inputSchema: {
      symbols: symbolsSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_ticker_summary",
    title: "Fetch Ticker Summary",
    description:
      "Load markets and fetch tickers, then return compact long/short/liquidity rankings instead of the full ticker payload.",
    inputSchema: {
      symbols: symbolsSchema,
      maxItems: maxItemsSchema,
      minQuoteVolume: minQuoteVolumeSchema,
      quote: z.string().min(1).optional(),
      settle: z.string().min(1).optional(),
      linear: z.boolean().optional(),
      swap: z.boolean().optional(),
      active: z.boolean().optional(),
      excludeStableBases: z.boolean().optional(),
      excludeNonCryptoBases: z.boolean().optional(),
      reloadMarkets: z.boolean().optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_order_book",
    title: "Fetch Order Book",
    description: "Call exchange.fetchOrderBook(symbol, limit, params).",
    inputSchema: {
      symbol: z.string().min(1),
      limit: limitSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_trades",
    title: "Fetch Trades",
    description: "Call exchange.fetchTrades(symbol, since, limit, params).",
    inputSchema: {
      symbol: z.string().min(1),
      since: sinceSchema,
      limit: limitSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_ohlcv",
    title: "Fetch OHLCV",
    description: "Call exchange.fetchOHLCV(symbol, timeframe, since, limit, params).",
    inputSchema: {
      symbol: z.string().min(1),
      timeframe: z.string().min(1).optional(),
      since: sinceSchema,
      limit: limitSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_balance",
    title: "Fetch Balance",
    description: "Call exchange.fetchBalance(params). Requires valid API credentials.",
    inputSchema: {
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_open_orders",
    title: "Fetch Open Orders",
    description: "Call exchange.fetchOpenOrders(symbol, since, limit, params).",
    inputSchema: {
      symbol: z.string().min(1).optional(),
      since: sinceSchema,
      limit: limitSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_open_algo_orders",
    title: "Fetch Open Algo Orders",
    description: "Call Binance Futures fapiPrivateGetOpenAlgoOrders(params) for conditional protection orders.",
    inputSchema: {
      symbol: z.string().min(1).optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_cancel_algo_order",
    title: "Cancel Algo Order",
    description: "Call Binance Futures fapiPrivateDeleteAlgoOrder(params) for conditional protection orders.",
    inputSchema: {
      symbol: z.string().min(1),
      algoId: algoIdSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_cancel_all_algo_orders",
    title: "Cancel All Algo Orders",
    description: "Call Binance Futures fapiPrivateDeleteAlgoOpenOrders(params) for conditional protection orders.",
    inputSchema: {
      symbol: z.string().min(1),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_closed_orders",
    title: "Fetch Closed Orders",
    description: "Call exchange.fetchClosedOrders(symbol, since, limit, params).",
    inputSchema: {
      symbol: z.string().min(1).optional(),
      since: sinceSchema,
      limit: limitSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_order",
    title: "Fetch Order",
    description: "Call exchange.fetchOrder(id, symbol, params).",
    inputSchema: {
      id: z.string().min(1),
      symbol: z.string().min(1).optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_cancel_order",
    title: "Cancel Order",
    description: "Call exchange.cancelOrder(id, symbol, params), subject to the trading gate.",
    inputSchema: {
      id: z.string().min(1),
      symbol: z.string().min(1).optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_create_order",
    title: "Create Order",
    description: "Call exchange.createOrder(symbol, type, side, amount, price, params), subject to the trading gate.",
    inputSchema: {
      symbol: z.string().min(1),
      type: z.string().min(1),
      side: z.enum(["buy", "sell"]),
      amount: z.number().positive(),
      price: z.number().positive().optional(),
      params: paramsSchema
    }
  },
  {
    name: "ccxt_call",
    title: "Call CCXT Method",
    description: "Call any existing method on the configured CCXT exchange. Mutating methods are subject to the trading gate.",
    inputSchema: {
      method: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      args: z.array(z.unknown()).optional()
    }
  },
  {
    name: "ccxt_create_protected_futures_entry",
    title: "Create Protected Futures Entry",
    description:
      "Create a Binance USDT-M protected entry by submitting close-position stop-loss and take-profit algo orders before the entry order.",
    inputSchema: {
      ...orderCoreSchema,
      stopLoss: z.number().positive(),
      takeProfit: z.number().positive()
    }
  },
  {
    name: "ccxt_fetch_binance_derivatives_sentiment",
    title: "Fetch Binance Futures Sentiment",
    description:
      "Fetch free Binance futures data endpoints for open-interest history, global/top long-short ratios, and taker buy/sell volume.",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_binance_global_long_short_account_ratio",
    title: "Fetch Binance Global Long Short Ratio",
    description: "Call Binance futures fapiDataGetGlobalLongShortAccountRatio(params).",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_binance_top_long_short_account_ratio",
    title: "Fetch Binance Top Trader Account Ratio",
    description: "Call Binance futures fapiDataGetTopLongShortAccountRatio(params).",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_binance_top_long_short_position_ratio",
    title: "Fetch Binance Top Trader Position Ratio",
    description: "Call Binance futures fapiDataGetTopLongShortPositionRatio(params).",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_binance_taker_long_short_ratio",
    title: "Fetch Binance Taker Buy Sell Volume",
    description: "Call Binance futures fapiDataGetTakerlongshortRatio(params).",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  },
  {
    name: "ccxt_fetch_binance_open_interest_hist",
    title: "Fetch Binance Open Interest History",
    description: "Call Binance futures fapiDataGetOpenInterestHist(params).",
    inputSchema: {
      symbol: z.string().min(1),
      period: binanceDerivativesPeriodSchema,
      limit: z.number().int().positive().max(500).optional(),
      startTime: sinceSchema,
      endTime: sinceSchema,
      params: paramsSchema
    }
  }
];

interface MethodToolSpec {
  name: string;
  title: string;
  description: string;
  method: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  buildArgs: (args?: JsonRecord) => unknown[];
  mutating?: boolean;
}

const methodToolSpecs: MethodToolSpec[] = [
  {
    name: "ccxt_fetch_currencies",
    title: "Fetch Currencies",
    description: "Call exchange.fetchCurrencies(params).",
    method: "fetchCurrencies",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_status",
    title: "Fetch Status",
    description: "Call exchange.fetchStatus(params).",
    method: "fetchStatus",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_time",
    title: "Fetch Exchange Time",
    description: "Call exchange.fetchTime(params).",
    method: "fetchTime",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_trading_fees",
    title: "Fetch Trading Fees",
    description: "Call exchange.fetchTradingFees(params).",
    method: "fetchTradingFees",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_trading_fee",
    title: "Fetch Trading Fee",
    description: "Call exchange.fetchTradingFee(symbol, params).",
    method: "fetchTradingFee",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposit_withdraw_fees",
    title: "Fetch Deposit Withdraw Fees",
    description: "Call exchange.fetchDepositWithdrawFees(codes, params).",
    method: "fetchDepositWithdrawFees",
    inputSchema: { codes: codesSchema, params: paramsSchema },
    buildArgs: (args) => [args?.codes, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposit_withdraw_fee",
    title: "Fetch Deposit Withdraw Fee",
    description: "Call exchange.fetchDepositWithdrawFee(code, params).",
    method: "fetchDepositWithdrawFee",
    inputSchema: { code: codeSchema, params: paramsSchema },
    buildArgs: (args) => [args?.code, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_accounts",
    title: "Fetch Accounts",
    description: "Call exchange.fetchAccounts(params).",
    method: "fetchAccounts",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_free_balance",
    title: "Fetch Free Balance",
    description: "Call exchange.fetchFreeBalance(params).",
    method: "fetchFreeBalance",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_used_balance",
    title: "Fetch Used Balance",
    description: "Call exchange.fetchUsedBalance(params).",
    method: "fetchUsedBalance",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_total_balance",
    title: "Fetch Total Balance",
    description: "Call exchange.fetchTotalBalance(params).",
    method: "fetchTotalBalance",
    inputSchema: { params: paramsSchema },
    buildArgs: (args) => [cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_positions",
    title: "Fetch Positions",
    description: "Call exchange.fetchPositions(symbols, params).",
    method: "fetchPositions",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_positions_for_symbol",
    title: "Fetch Positions For Symbol",
    description: "Call exchange.fetchPositionsForSymbol(symbol, params).",
    method: "fetchPositionsForSymbol",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_positions_risk",
    title: "Fetch Positions Risk",
    description: "Call exchange.fetchPositionsRisk(symbols, params).",
    method: "fetchPositionsRisk",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_positions_history",
    title: "Fetch Positions History",
    description: "Call exchange.fetchPositionsHistory(symbols, since, limit, params).",
    method: "fetchPositionsHistory",
    inputSchema: { symbols: symbolsSchema, since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbols, optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_leverage",
    title: "Fetch Leverage",
    description: "Call exchange.fetchLeverage(symbol, params).",
    method: "fetchLeverage",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_leverages",
    title: "Fetch Leverages",
    description: "Call exchange.fetchLeverages(symbols, params).",
    method: "fetchLeverages",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_leverage_tiers",
    title: "Fetch Leverage Tiers",
    description: "Call exchange.fetchLeverageTiers(symbols, params).",
    method: "fetchLeverageTiers",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_market_leverage_tiers",
    title: "Fetch Market Leverage Tiers",
    description: "Call exchange.fetchMarketLeverageTiers(symbol, params).",
    method: "fetchMarketLeverageTiers",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_ledger",
    title: "Fetch Ledger",
    description: "Call exchange.fetchLedger(code, since, limit, params).",
    method: "fetchLedger",
    inputSchema: codeSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "code"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_ledger_entry",
    title: "Fetch Ledger Entry",
    description: "Call exchange.fetchLedgerEntry(id, code, params).",
    method: "fetchLedgerEntry",
    inputSchema: { id: idSchema, code: codeSchema.optional(), params: paramsSchema },
    buildArgs: (args) => [args?.id, optionalString(args, "code"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_my_trades",
    title: "Fetch My Trades",
    description: "Call exchange.fetchMyTrades(symbol, since, limit, params).",
    method: "fetchMyTrades",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_order_trades",
    title: "Fetch Order Trades",
    description: "Call exchange.fetchOrderTrades(id, symbol, since, limit, params).",
    method: "fetchOrderTrades",
    inputSchema: { id: idSchema, symbol: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.id, optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposit_address",
    title: "Fetch Deposit Address",
    description: "Call exchange.fetchDepositAddress(code, params).",
    method: "fetchDepositAddress",
    inputSchema: { code: codeSchema, params: paramsSchema },
    buildArgs: (args) => [args?.code, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposit_addresses",
    title: "Fetch Deposit Addresses",
    description: "Call exchange.fetchDepositAddresses(codes, params).",
    method: "fetchDepositAddresses",
    inputSchema: { codes: codesSchema, params: paramsSchema },
    buildArgs: (args) => [args?.codes, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposit_addresses_by_network",
    title: "Fetch Deposit Addresses By Network",
    description: "Call exchange.fetchDepositAddressesByNetwork(code, params).",
    method: "fetchDepositAddressesByNetwork",
    inputSchema: { code: codeSchema, params: paramsSchema },
    buildArgs: (args) => [args?.code, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposits",
    title: "Fetch Deposits",
    description: "Call exchange.fetchDeposits(code, since, limit, params).",
    method: "fetchDeposits",
    inputSchema: codeSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "code"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_withdrawals",
    title: "Fetch Withdrawals",
    description: "Call exchange.fetchWithdrawals(code, since, limit, params).",
    method: "fetchWithdrawals",
    inputSchema: codeSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "code"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_deposits_withdrawals",
    title: "Fetch Deposits Withdrawals",
    description: "Call exchange.fetchDepositsWithdrawals(code, since, limit, params).",
    method: "fetchDepositsWithdrawals",
    inputSchema: codeSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "code"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_borrow_interest",
    title: "Fetch Borrow Interest",
    description: "Call exchange.fetchBorrowInterest(code, symbol, since, limit, params).",
    method: "fetchBorrowInterest",
    inputSchema: { code: codeSchema.optional(), symbol: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [optionalString(args, "code"), optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_orders",
    title: "Fetch Orders",
    description: "Call exchange.fetchOrders(symbol, since, limit, params).",
    method: "fetchOrders",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_canceled_orders",
    title: "Fetch Canceled Orders",
    description: "Call exchange.fetchCanceledOrders(symbol, since, limit, params).",
    method: "fetchCanceledOrders",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_canceled_and_closed_orders",
    title: "Fetch Canceled And Closed Orders",
    description: "Call exchange.fetchCanceledAndClosedOrders(symbol, since, limit, params).",
    method: "fetchCanceledAndClosedOrders",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_create_orders",
    title: "Create Orders",
    description: "Call exchange.createOrders(orders, params), subject to the trading gate.",
    method: "createOrders",
    inputSchema: { orders: ordersSchema, params: paramsSchema },
    buildArgs: (args) => [args?.orders, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_edit_order",
    title: "Edit Order",
    description: "Call exchange.editOrder(id, symbol, type, side, amount, price, params), subject to the trading gate.",
    method: "editOrder",
    inputSchema: { id: idSchema, ...orderCoreSchema, amount: z.number().positive().optional() },
    buildArgs: (args) => [args?.id, args?.symbol, args?.type, args?.side, optionalNumber(args, "amount"), optionalNumber(args, "price"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_edit_orders",
    title: "Edit Orders",
    description: "Call exchange.editOrders(orders, params), subject to the trading gate.",
    method: "editOrders",
    inputSchema: { orders: ordersSchema, params: paramsSchema },
    buildArgs: (args) => [args?.orders, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_cancel_orders",
    title: "Cancel Orders",
    description: "Call exchange.cancelOrders(ids, symbol, params), subject to the trading gate.",
    method: "cancelOrders",
    inputSchema: { ids: z.array(idSchema), symbol: z.string().min(1).optional(), params: paramsSchema },
    buildArgs: (args) => [args?.ids, optionalString(args, "symbol"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_cancel_all_orders",
    title: "Cancel All Orders",
    description: "Call exchange.cancelAllOrders(symbol, params), subject to the trading gate.",
    method: "cancelAllOrders",
    inputSchema: { symbol: z.string().min(1).optional(), params: paramsSchema },
    buildArgs: (args) => [optionalString(args, "symbol"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_cancel_all_orders_after",
    title: "Cancel All Orders After",
    description: "Call exchange.cancelAllOrdersAfter(timeout, params), subject to the trading gate.",
    method: "cancelAllOrdersAfter",
    inputSchema: { timeout: z.number().int().positive(), params: paramsSchema },
    buildArgs: (args) => [optionalNumber(args, "timeout"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_cancel_orders_for_symbols",
    title: "Cancel Orders For Symbols",
    description: "Call exchange.cancelOrdersForSymbols(orders, params), subject to the trading gate.",
    method: "cancelOrdersForSymbols",
    inputSchema: { orders: orderRequestsSchema, params: paramsSchema },
    buildArgs: (args) => [args?.orders, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_limit_order",
    title: "Create Limit Order",
    description: "Call exchange.createLimitOrder(symbol, side, amount, price, params), subject to the trading gate.",
    method: "createLimitOrder",
    inputSchema: { symbol: z.string().min(1), side: sideSchema, amount: amountSchema, price: z.number().positive(), params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.side, args?.amount, args?.price, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_market_order",
    title: "Create Market Order",
    description: "Call exchange.createMarketOrder(symbol, side, amount, price, params), subject to the trading gate.",
    method: "createMarketOrder",
    inputSchema: { symbol: z.string().min(1), side: sideSchema, amount: amountSchema, price: priceSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.side, args?.amount, optionalNumber(args, "price"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_trigger_order",
    title: "Create Trigger Order",
    description: "Call exchange.createTriggerOrder(symbol, type, side, amount, price, triggerPrice, params), subject to the trading gate.",
    method: "createTriggerOrder",
    inputSchema: { ...orderCoreSchema, triggerPrice: z.number().positive() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.triggerPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_stop_loss_order",
    title: "Create Stop Loss Order",
    description: "Call exchange.createStopLossOrder(symbol, type, side, amount, price, stopLossPrice, params), subject to the trading gate.",
    method: "createStopLossOrder",
    inputSchema: { ...orderCoreSchema, stopLossPrice: z.number().positive() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.stopLossPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_take_profit_order",
    title: "Create Take Profit Order",
    description: "Call exchange.createTakeProfitOrder(symbol, type, side, amount, price, takeProfitPrice, params), subject to the trading gate.",
    method: "createTakeProfitOrder",
    inputSchema: { ...orderCoreSchema, takeProfitPrice: z.number().positive() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.takeProfitPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_order_with_take_profit_and_stop_loss",
    title: "Create Order With Take Profit And Stop Loss",
    description: "Call exchange.createOrderWithTakeProfitAndStopLoss(symbol, type, side, amount, price, takeProfit, stopLoss, params), subject to the trading gate.",
    method: "createOrderWithTakeProfitAndStopLoss",
    inputSchema: { ...orderCoreSchema, takeProfit: z.number().positive().optional(), stopLoss: z.number().positive().optional() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), optionalNumber(args, "takeProfit"), optionalNumber(args, "stopLoss"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_trailing_amount_order",
    title: "Create Trailing Amount Order",
    description: "Call exchange.createTrailingAmountOrder(symbol, type, side, amount, price, trailingAmount, trailingTriggerPrice, params), subject to the trading gate.",
    method: "createTrailingAmountOrder",
    inputSchema: { ...orderCoreSchema, trailingAmount: z.number().positive(), trailingTriggerPrice: z.number().positive().optional() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.trailingAmount, optionalNumber(args, "trailingTriggerPrice"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_trailing_percent_order",
    title: "Create Trailing Percent Order",
    description: "Call exchange.createTrailingPercentOrder(symbol, type, side, amount, price, trailingPercent, trailingTriggerPrice, params), subject to the trading gate.",
    method: "createTrailingPercentOrder",
    inputSchema: { ...orderCoreSchema, trailingPercent: z.number().positive(), trailingTriggerPrice: z.number().positive().optional() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.trailingPercent, optionalNumber(args, "trailingTriggerPrice"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_stop_order",
    title: "Create Stop Order",
    description: "Call exchange.createStopOrder(symbol, type, side, amount, price, triggerPrice, params), subject to the trading gate.",
    method: "createStopOrder",
    inputSchema: { ...orderCoreSchema, triggerPrice: z.number().positive() },
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), args?.triggerPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_stop_limit_order",
    title: "Create Stop Limit Order",
    description: "Call exchange.createStopLimitOrder(symbol, side, amount, price, triggerPrice, params), subject to the trading gate.",
    method: "createStopLimitOrder",
    inputSchema: { symbol: z.string().min(1), side: sideSchema, amount: amountSchema, price: z.number().positive(), triggerPrice: z.number().positive(), params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.side, args?.amount, args?.price, args?.triggerPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_stop_market_order",
    title: "Create Stop Market Order",
    description: "Call exchange.createStopMarketOrder(symbol, side, amount, triggerPrice, params), subject to the trading gate.",
    method: "createStopMarketOrder",
    inputSchema: { symbol: z.string().min(1), side: sideSchema, amount: amountSchema, triggerPrice: z.number().positive(), params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.side, args?.amount, args?.triggerPrice, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_post_only_order",
    title: "Create Post Only Order",
    description: "Call exchange.createPostOnlyOrder(symbol, type, side, amount, price, params), subject to the trading gate.",
    method: "createPostOnlyOrder",
    inputSchema: orderCoreSchema,
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_create_reduce_only_order",
    title: "Create Reduce Only Order",
    description: "Call exchange.createReduceOnlyOrder(symbol, type, side, amount, price, params), subject to the trading gate.",
    method: "createReduceOnlyOrder",
    inputSchema: orderCoreSchema,
    buildArgs: (args) => [args?.symbol, args?.type, args?.side, args?.amount, optionalNumber(args, "price"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_fetch_funding_rate",
    title: "Fetch Funding Rate",
    description: "Call exchange.fetchFundingRate(symbol, params).",
    method: "fetchFundingRate",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_funding_rates",
    title: "Fetch Funding Rates",
    description: "Call exchange.fetchFundingRates(symbols, params).",
    method: "fetchFundingRates",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_funding_rate_history",
    title: "Fetch Funding Rate History",
    description: "Call exchange.fetchFundingRateHistory(symbol, since, limit, params).",
    method: "fetchFundingRateHistory",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_funding_history",
    title: "Fetch Funding History",
    description: "Call exchange.fetchFundingHistory(symbol, since, limit, params).",
    method: "fetchFundingHistory",
    inputSchema: optionalSymbolSinceLimitParamsSchema,
    buildArgs: (args) => [optionalString(args, "symbol"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_open_interest",
    title: "Fetch Open Interest",
    description: "Call exchange.fetchOpenInterest(symbol, params).",
    method: "fetchOpenInterest",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_open_interests",
    title: "Fetch Open Interests",
    description: "Call exchange.fetchOpenInterests(symbols, params).",
    method: "fetchOpenInterests",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_open_interest_history",
    title: "Fetch Open Interest History",
    description: "Call exchange.fetchOpenInterestHistory(symbol, timeframe, since, limit, params).",
    method: "fetchOpenInterestHistory",
    inputSchema: { symbol: z.string().min(1), timeframe: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, optionalString(args, "timeframe"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_mark_price",
    title: "Fetch Mark Price",
    description: "Call exchange.fetchMarkPrice(symbol, params).",
    method: "fetchMarkPrice",
    inputSchema: symbolParamsSchema,
    buildArgs: (args) => [args?.symbol, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_mark_prices",
    title: "Fetch Mark Prices",
    description: "Call exchange.fetchMarkPrices(symbols, params).",
    method: "fetchMarkPrices",
    inputSchema: symbolsParamsSchema,
    buildArgs: (args) => [args?.symbols, cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_mark_ohlcv",
    title: "Fetch Mark OHLCV",
    description: "Call exchange.fetchMarkOHLCV(symbol, timeframe, since, limit, params).",
    method: "fetchMarkOHLCV",
    inputSchema: { symbol: z.string().min(1), timeframe: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, optionalString(args, "timeframe"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_index_ohlcv",
    title: "Fetch Index OHLCV",
    description: "Call exchange.fetchIndexOHLCV(symbol, timeframe, since, limit, params).",
    method: "fetchIndexOHLCV",
    inputSchema: { symbol: z.string().min(1), timeframe: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, optionalString(args, "timeframe"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_fetch_premium_index_ohlcv",
    title: "Fetch Premium Index OHLCV",
    description: "Call exchange.fetchPremiumIndexOHLCV(symbol, timeframe, since, limit, params).",
    method: "fetchPremiumIndexOHLCV",
    inputSchema: { symbol: z.string().min(1), timeframe: z.string().min(1).optional(), since: sinceSchema, limit: limitSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, optionalString(args, "timeframe"), optionalNumber(args, "since"), optionalNumber(args, "limit"), cleanParams(args?.params)]
  },
  {
    name: "ccxt_set_leverage",
    title: "Set Leverage",
    description: "Call exchange.setLeverage(leverage, symbol, params), subject to the trading gate.",
    method: "setLeverage",
    inputSchema: { leverage: z.number().int().positive(), symbol: z.string().min(1).optional(), params: paramsSchema },
    buildArgs: (args) => [args?.leverage, optionalString(args, "symbol"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_set_margin_mode",
    title: "Set Margin Mode",
    description: "Call exchange.setMarginMode(marginMode, symbol, params), subject to the trading gate.",
    method: "setMarginMode",
    inputSchema: { marginMode: z.string().min(1), symbol: z.string().min(1).optional(), params: paramsSchema },
    buildArgs: (args) => [args?.marginMode, optionalString(args, "symbol"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_set_position_mode",
    title: "Set Position Mode",
    description: "Call exchange.setPositionMode(hedged, symbol, params), subject to the trading gate.",
    method: "setPositionMode",
    inputSchema: { hedged: z.boolean(), symbol: z.string().min(1).optional(), params: paramsSchema },
    buildArgs: (args) => [args?.hedged, optionalString(args, "symbol"), cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_add_margin",
    title: "Add Margin",
    description: "Call exchange.addMargin(symbol, amount, params), subject to the trading gate.",
    method: "addMargin",
    inputSchema: { symbol: z.string().min(1), amount: amountSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.amount, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_reduce_margin",
    title: "Reduce Margin",
    description: "Call exchange.reduceMargin(symbol, amount, params), subject to the trading gate.",
    method: "reduceMargin",
    inputSchema: { symbol: z.string().min(1), amount: amountSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.amount, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_set_margin",
    title: "Set Margin",
    description: "Call exchange.setMargin(symbol, amount, params), subject to the trading gate.",
    method: "setMargin",
    inputSchema: { symbol: z.string().min(1), amount: amountSchema, params: paramsSchema },
    buildArgs: (args) => [args?.symbol, args?.amount, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_transfer",
    title: "Transfer",
    description: "Call exchange.transfer(code, amount, fromAccount, toAccount, params), subject to the trading gate.",
    method: "transfer",
    inputSchema: { code: codeSchema, amount: amountSchema, fromAccount: z.string().min(1), toAccount: z.string().min(1), params: paramsSchema },
    buildArgs: (args) => [args?.code, args?.amount, args?.fromAccount, args?.toAccount, cleanParams(args?.params)],
    mutating: true
  },
  {
    name: "ccxt_withdraw",
    title: "Withdraw",
    description: "Call exchange.withdraw(code, amount, address, tag, params), subject to the trading gate.",
    method: "withdraw",
    inputSchema: { code: codeSchema, amount: amountSchema, address: z.string().min(1), tag: z.string().optional(), params: paramsSchema },
    buildArgs: (args) => [args?.code, args?.amount, args?.address, optionalString(args, "tag"), cleanParams(args?.params)],
    mutating: true
  }
];

toolDefinitions.push(
  ...methodToolSpecs.map((spec) => ({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema
  }))
);

const blockedMethodNames = new Set(["constructor", "prototype", "__proto__", "then"]);

function methodIsCallable(exchange: ExchangeLike, method: string): method is string {
  return !blockedMethodNames.has(method) && typeof exchange[method] === "function";
}

function isMutatingMethod(method: string): boolean {
  const normalized = method.toLowerCase();
  return (
    normalized.startsWith("create") ||
    normalized.startsWith("cancel") ||
    normalized.startsWith("edit") ||
    normalized.startsWith("withdraw") ||
    normalized.startsWith("transfer") ||
    normalized.startsWith("borrow") ||
    normalized.startsWith("repay") ||
    normalized.startsWith("set") ||
    normalized.includes("post") ||
    normalized.includes("put") ||
    normalized.includes("delete")
  );
}

function dryRunResult(config: CcxtMcpConfig, wouldCall: string, params: unknown): JsonRecord {
  return {
    dryRun: true,
    exchange: config.exchangeId,
    reason: config.enableTrading
      ? "CCXT_DRY_RUN is true"
      : "CCXT_ENABLE_TRADING is not true",
    wouldCall,
    params
  };
}

function cleanParams(params: unknown): JsonRecord {
  return params && typeof params === "object" && !Array.isArray(params) ? (params as JsonRecord) : {};
}

function optionalNumber(args: JsonRecord | undefined, key: string): number | undefined {
  const value = args?.[key];
  return typeof value === "number" ? value : undefined;
}

function optionalString(args: JsonRecord | undefined, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" ? value : undefined;
}

function optionalBooleanLike(args: JsonRecord, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return undefined;
}

const stableBaseAssets = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "DAI",
  "BUSD",
  "USDP",
  "USDE",
  "PYUSD",
  "USD1",
  "BFUSD",
  "USDT"
]);

const nonCryptoBaseAssets = new Set([
  "AAPL",
  "AMZN",
  "GOOGL",
  "META",
  "MSFT",
  "NVDA",
  "QCOM",
  "TSLA",
  "XAG",
  "XAU",
  "CL"
]);

interface TickerSummaryFilters {
  quote: string;
  settle: string;
  linear: boolean;
  swap: boolean;
  active: boolean;
  minQuoteVolume: number;
  maxItems: number;
  excludeStableBases: boolean;
  excludeNonCryptoBases: boolean;
}

interface TickerSummaryRow {
  symbol: string;
  base: string;
  last: number;
  percentage: number;
  quoteVolume: number;
  timestamp?: number;
  datetime?: string;
  tags: string[];
}

function optionalBoolean(args: JsonRecord | undefined, key: string): boolean | undefined {
  const value = args?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function tickerSummaryFilters(args: JsonRecord | undefined): TickerSummaryFilters {
  return {
    quote: optionalString(args, "quote") ?? "USDT",
    settle: optionalString(args, "settle") ?? "USDT",
    linear: optionalBoolean(args, "linear") ?? true,
    swap: optionalBoolean(args, "swap") ?? true,
    active: optionalBoolean(args, "active") ?? true,
    minQuoteVolume: optionalNumber(args, "minQuoteVolume") ?? 0,
    maxItems: optionalNumber(args, "maxItems") ?? 5,
    excludeStableBases: optionalBoolean(args, "excludeStableBases") ?? true,
    excludeNonCryptoBases: optionalBoolean(args, "excludeNonCryptoBases") ?? true
  };
}

function numberFromRecord(record: JsonRecord | undefined, keys: string[]): number | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function isTradingMarket(market: JsonRecord): boolean {
  const info = recordOrUndefined(market.info);
  const status = stringFromRecord(info ?? {}, ["contractStatus", "status"]);
  return status === undefined || status === "TRADING";
}

function matchesTickerSummaryMarket(market: JsonRecord, filters: TickerSummaryFilters): boolean {
  return (
    market.quote === filters.quote &&
    market.settle === filters.settle &&
    market.linear === filters.linear &&
    market.swap === filters.swap &&
    market.contract === true &&
    market.active === filters.active &&
    isTradingMarket(market)
  );
}

function tickerTags(percentage: number): string[] {
  const tags: string[] = [];
  if (percentage >= 30) {
    tags.push("overheated>=30%");
  }
  if (percentage <= -20) {
    tags.push("overcold<=-20%");
  }
  return tags;
}

function buildTickerSummaryRow(market: JsonRecord, ticker: JsonRecord): TickerSummaryRow | undefined {
  const symbol = stringFromRecord(ticker, ["symbol"]) ?? stringFromRecord(market, ["symbol"]);
  const base = stringFromRecord(market, ["base"]);
  const last = numberFromRecord(ticker, ["last", "close"]);
  const percentage = numberFromRecord(ticker, ["percentage"]);
  const quoteVolume = numberFromRecord(ticker, ["quoteVolume"]);

  if (!symbol || !base || last === undefined || percentage === undefined || quoteVolume === undefined) {
    return undefined;
  }

  const row: TickerSummaryRow = {
    symbol,
    base,
    last,
    percentage,
    quoteVolume,
    tags: tickerTags(percentage)
  };
  const timestamp = numberFromRecord(ticker, ["timestamp"]);
  const datetime = stringFromRecord(ticker, ["datetime"]);
  if (timestamp !== undefined) {
    row.timestamp = timestamp;
  }
  if (datetime !== undefined) {
    row.datetime = datetime;
  }
  return row;
}

function uniqueSymbols(rows: TickerSummaryRow[]): string[] {
  return [...new Set(rows.map((row) => row.symbol))];
}

async function buildTickerSummary(exchange: ExchangeLike, args: JsonRecord | undefined): Promise<JsonRecord> {
  const filters = tickerSummaryFilters(args);
  const requestedSymbols = Array.isArray(args?.symbols)
    ? args.symbols.filter((symbol): symbol is string => typeof symbol === "string")
    : undefined;
  const requestedSymbolSet = requestedSymbols ? new Set(requestedSymbols) : undefined;
  const markets = await invoke(exchange, "loadMarkets", [Boolean(args?.reloadMarkets)]);
  const tickers = await invoke(exchange, "fetchTickers", [requestedSymbols, cleanParams(args?.params)]);
  const marketRecords = Object.values(cleanParams(markets));
  const tickerRecords = cleanParams(tickers);
  const excluded = {
    ineligibleMarket: 0,
    stableBase: 0,
    nonCryptoBase: 0,
    belowMinQuoteVolume: 0,
    missingTickerFields: 0
  };

  const eligibleMarkets = new Map<string, JsonRecord>();
  for (const item of marketRecords) {
    const market = recordOrUndefined(item);
    const symbol = stringFromRecord(market ?? {}, ["symbol"]);
    const base = stringFromRecord(market ?? {}, ["base"]);
    if (!market || !symbol || (requestedSymbolSet && !requestedSymbolSet.has(symbol))) {
      continue;
    }
    if (!matchesTickerSummaryMarket(market, filters)) {
      excluded.ineligibleMarket += 1;
      continue;
    }
    if (base && filters.excludeStableBases && stableBaseAssets.has(base)) {
      excluded.stableBase += 1;
      continue;
    }
    if (base && filters.excludeNonCryptoBases && nonCryptoBaseAssets.has(base)) {
      excluded.nonCryptoBase += 1;
      continue;
    }
    eligibleMarkets.set(symbol, market);
  }

  const rows: TickerSummaryRow[] = [];
  for (const [symbol, market] of eligibleMarkets.entries()) {
    const ticker = recordOrUndefined(tickerRecords[symbol]);
    const row = buildTickerSummaryRow(market, ticker ?? {});
    if (!row) {
      excluded.missingTickerFields += 1;
      continue;
    }
    if (row.quoteVolume < filters.minQuoteVolume) {
      excluded.belowMinQuoteVolume += 1;
      continue;
    }
    rows.push(row);
  }

  const longTop = [...rows]
    .filter((row) => row.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage || b.quoteVolume - a.quoteVolume)
    .slice(0, filters.maxItems);
  const shortTop = [...rows]
    .filter((row) => row.percentage < 0)
    .sort((a, b) => a.percentage - b.percentage || b.quoteVolume - a.quoteVolume)
    .slice(0, filters.maxItems);
  const liquidityTop = [...rows]
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, filters.maxItems);
  const milliseconds = methodIsCallable(exchange, "milliseconds")
    ? await invoke(exchange, "milliseconds")
    : Date.now();

  return {
    generatedAt: typeof milliseconds === "number" ? milliseconds : Date.now(),
    filters,
    universe: {
      markets: marketRecords.length,
      eligibleMarkets: eligibleMarkets.size,
      tickers: Object.keys(tickerRecords).length,
      summarizedTickers: rows.length,
      excluded
    },
    longTop,
    shortTop,
    liquidityTop,
    seedSymbols: uniqueSymbols([...longTop, ...shortTop, ...liquidityTop])
  };
}

function normalizeBinanceFuturesSymbol(symbol: string | undefined): string | undefined {
  if (!symbol) {
    return undefined;
  }

  const [baseAndQuote] = symbol.split(":");
  return baseAndQuote.replace("/", "").toUpperCase();
}

function buildBinanceDerivativesDataParams(args: JsonRecord | undefined): JsonRecord {
  const params = cleanParams(args?.params);
  const rawSymbol = optionalString(args, "symbol") ?? (typeof params.symbol === "string" ? params.symbol : undefined);
  const symbol = normalizeBinanceFuturesSymbol(rawSymbol);
  if (!symbol) {
    throw new Error("Binance futures derivatives data requires a symbol.");
  }

  const request: JsonRecord = {
    ...params,
    symbol,
    period: optionalString(args, "period") ?? (typeof params.period === "string" ? params.period : "15m")
  };
  const limit = optionalNumber(args, "limit");
  const startTime = optionalNumber(args, "startTime");
  const endTime = optionalNumber(args, "endTime");
  if (limit !== undefined) {
    request.limit = limit;
  }
  if (startTime !== undefined) {
    request.startTime = startTime;
  }
  if (endTime !== undefined) {
    request.endTime = endTime;
  }
  return request;
}

const binanceDerivativesDataMethods = {
  openInterestHist: "fapiDataGetOpenInterestHist",
  globalLongShortAccountRatio: "fapiDataGetGlobalLongShortAccountRatio",
  topLongShortAccountRatio: "fapiDataGetTopLongShortAccountRatio",
  topLongShortPositionRatio: "fapiDataGetTopLongShortPositionRatio",
  takerLongShortRatio: "fapiDataGetTakerlongshortRatio"
} as const;

type BinanceDerivativesDataKey = keyof typeof binanceDerivativesDataMethods;

async function fetchBinanceDerivativesData(
  exchange: ExchangeLike,
  key: BinanceDerivativesDataKey,
  args: JsonRecord | undefined
): Promise<unknown> {
  const params = buildBinanceDerivativesDataParams(args);
  return await invoke(exchange, binanceDerivativesDataMethods[key], [params]);
}

async function buildBinanceDerivativesSentiment(exchange: ExchangeLike, args: JsonRecord | undefined): Promise<JsonRecord> {
  const params = buildBinanceDerivativesDataParams(args);
  const entries = await Promise.all(
    Object.entries(binanceDerivativesDataMethods).map(async ([key, method]) => {
      try {
        return [key, { ok: true, method, data: await invoke(exchange, method, [params]) }] as const;
      } catch (error) {
        return [
          key,
          {
            ok: false,
            method,
            error: error instanceof Error ? error.message : String(error)
          }
        ] as const;
      }
    })
  );

  return {
    source: "binance-futures-public-data",
    freeOnly: true,
    params,
    datasets: Object.fromEntries(entries)
  };
}

function buildBinanceOpenAlgoOrdersParams(args: JsonRecord | undefined): JsonRecord {
  const params = cleanParams(args?.params);
  const rawSymbol = optionalString(args, "symbol") ?? (typeof params.symbol === "string" ? params.symbol : undefined);
  const symbol = normalizeBinanceFuturesSymbol(rawSymbol);

  return symbol ? { ...params, symbol } : params;
}

function buildBinanceCancelAlgoOrderParams(args: JsonRecord | undefined): JsonRecord {
  const params = buildBinanceOpenAlgoOrdersParams(args);
  const algoId = optionalString(args, "algoId") ?? (typeof params.algoId === "string" ? params.algoId : undefined);

  return algoId ? { ...params, algoId } : params;
}

function buildBinanceFuturesAlgoOrder(
  config: CcxtMcpConfig,
  toolName: string,
  args: JsonRecord | undefined
): JsonRecord | undefined {
  if (
    config.exchangeId !== "binance" ||
    (config.defaultType !== "future" && config.defaultType !== "swap") ||
    (toolName !== "ccxt_create_stop_loss_order" && toolName !== "ccxt_create_take_profit_order")
  ) {
    return undefined;
  }

  const triggerPrice =
    toolName === "ccxt_create_stop_loss_order" ? args?.stopLossPrice : args?.takeProfitPrice;
  if (typeof triggerPrice !== "number") {
    return undefined;
  }

  const params = cleanParams(args?.params);
  const orderType = String(args?.type ?? "").toLowerCase() === "market"
    ? toolName === "ccxt_create_stop_loss_order"
      ? "STOP_MARKET"
      : "TAKE_PROFIT_MARKET"
    : toolName === "ccxt_create_stop_loss_order"
      ? "STOP"
      : "TAKE_PROFIT";

  const payload: JsonRecord = {
    algoType: "CONDITIONAL",
    symbol: normalizeBinanceFuturesSymbol(optionalString(args, "symbol")),
    side: String(args?.side ?? "").toUpperCase(),
    type: orderType,
    triggerPrice: String(triggerPrice)
  };

  for (const key of [
    "positionSide",
    "workingType",
    "priceProtect",
    "newOrderRespType",
    "selfTradePreventionMode",
    "goodTillDate",
    "recvWindow",
    "clientAlgoId"
  ]) {
    if (params[key] !== undefined) {
      payload[key] = params[key];
    }
  }

  const closePosition = optionalBooleanLike(params, "closePosition");
  if (closePosition !== undefined) {
    payload.closePosition = closePosition ? "true" : "false";
  }
  if (!closePosition && args?.amount !== undefined) {
    payload.quantity = String(args.amount);
  }
  if (orderType === "STOP" || orderType === "TAKE_PROFIT") {
    const price = optionalNumber(args, "price");
    if (price !== undefined) {
      payload.price = String(price);
    }
    if (params.timeInForce !== undefined) {
      payload.timeInForce = params.timeInForce;
    }
  }

  return payload;
}

function isBinanceFuturesConfig(config: CcxtMcpConfig): boolean {
  return (
    config.exchangeId === "binance" &&
    (config.defaultType === "future" || config.defaultType === "swap")
  );
}

function isBinanceFuturesHedgePositionSide(params: JsonRecord): boolean {
  const positionSide = upperString(params.positionSide);
  return positionSide === "LONG" || positionSide === "SHORT";
}

function stripReduceOnlyParam(params: JsonRecord): JsonRecord {
  const sanitized = { ...params };
  delete sanitized.reduceOnly;
  delete sanitized.reduceonly;
  delete sanitized.reduce_only;
  return sanitized;
}

function sanitizeBinanceFuturesHedgeOrderParams(config: CcxtMcpConfig, params: JsonRecord): JsonRecord {
  if (!isBinanceFuturesConfig(config) || !isBinanceFuturesHedgePositionSide(params)) {
    return params;
  }

  return stripReduceOnlyParam(params);
}

function sanitizeFinalParamsArg(config: CcxtMcpConfig, args: unknown[]): unknown[] {
  if (args.length === 0) {
    return args;
  }

  const lastArg = args[args.length - 1];
  if (!lastArg || typeof lastArg !== "object" || Array.isArray(lastArg)) {
    return args;
  }

  return [
    ...args.slice(0, -1),
    sanitizeBinanceFuturesHedgeOrderParams(config, lastArg as JsonRecord)
  ];
}

function binanceFuturesHedgeReduceOnlyFallback(
  config: CcxtMcpConfig,
  spec: MethodToolSpec,
  args: JsonRecord | undefined
): { method: string; args: unknown[] } | undefined {
  if (
    spec.name !== "ccxt_create_reduce_only_order" ||
    !isBinanceFuturesConfig(config)
  ) {
    return undefined;
  }

  const params = cleanParams(args?.params);
  if (!isBinanceFuturesHedgePositionSide(params)) {
    return undefined;
  }

  return {
    method: "createOrder",
    args: [
      args?.symbol,
      args?.type,
      args?.side,
      args?.amount,
      optionalNumber(args, "price"),
      stripReduceOnlyParam(params)
    ]
  };
}

function oppositeSide(side: unknown): "buy" | "sell" | undefined {
  if (side === "buy") {
    return "sell";
  }
  if (side === "sell") {
    return "buy";
  }
  return undefined;
}

function defaultPositionSide(side: unknown, params: JsonRecord): string | undefined {
  if (typeof params.positionSide === "string") {
    return params.positionSide.toUpperCase();
  }
  if (side === "buy") {
    return "LONG";
  }
  if (side === "sell") {
    return "SHORT";
  }
  return undefined;
}

function protectedEntryError(
  config: CcxtMcpConfig,
  args: JsonRecord | undefined,
  stage: string,
  error: unknown,
  rollback: unknown[],
  entryOrderCreated = false
): JsonRecord {
  const message = error instanceof Error ? error.message : String(error);
  return {
    protectedEntry: false,
    exchange: config.exchangeId,
    symbol: optionalString(args, "symbol"),
    stage,
    entryOrderCreated,
    error: message,
    rollback
  };
}

function buildBinanceProtectedEntryPlan(config: CcxtMcpConfig, args: JsonRecord | undefined): JsonRecord | undefined {
  if (!isBinanceFuturesConfig(config)) {
    return undefined;
  }

  const stopLoss = optionalNumber(args, "stopLoss");
  const takeProfit = optionalNumber(args, "takeProfit");
  const exitSide = oppositeSide(args?.side);
  if (!stopLoss || !takeProfit || !exitSide) {
    return undefined;
  }

  const params = cleanParams(args?.params);
  const positionSide = defaultPositionSide(args?.side, params);
  const protectionParams: JsonRecord = {
    ...params,
    workingType: params.workingType ?? "MARK_PRICE",
    priceProtect: params.priceProtect ?? true
  };
  if (positionSide) {
    protectionParams.positionSide = positionSide;
  }

  const stopLossPayload = buildBinanceFuturesAlgoOrder(config, "ccxt_create_stop_loss_order", {
    symbol: args?.symbol,
    type: "market",
    side: exitSide,
    amount: args?.amount,
    stopLossPrice: stopLoss,
    params: protectionParams
  });
  const takeProfitPayload = buildBinanceFuturesAlgoOrder(config, "ccxt_create_take_profit_order", {
    symbol: args?.symbol,
    type: "market",
    side: exitSide,
    amount: args?.amount,
    takeProfitPrice: takeProfit,
    params: protectionParams
  });

  if (!stopLossPayload || !takeProfitPayload) {
    return undefined;
  }

  const entryParams: JsonRecord = { ...params };
  if (positionSide && entryParams.positionSide === undefined) {
    entryParams.positionSide = positionSide;
  }

  return {
    stopLossPayload,
    takeProfitPayload,
    entryArgs: [
      args?.symbol,
      args?.type,
      args?.side,
      args?.amount,
      optionalNumber(args, "price"),
      entryParams
    ]
  };
}

async function submitBinanceFuturesAlgoOrder(
  config: CcxtMcpConfig,
  exchange: ExchangeLike,
  payload: JsonRecord,
  extraParams: JsonRecord
): Promise<unknown> {
  const replaceExistingClosePosition =
    optionalBooleanLike(extraParams, "replaceExistingClosePosition") === true;

  if (optionalBooleanLike(payload, "closePosition") === true) {
    const openAlgoOrders = await invoke(exchange, "fapiPrivateGetOpenAlgoOrders", [
      {
        symbol: payload.symbol,
        algoType: "CONDITIONAL"
      }
    ]);
    const existingOrder = findMatchingClosePositionAlgoOrder(openAlgoOrders, payload);
    if (existingOrder) {
      if (replaceExistingClosePosition) {
        const algoId = stringFromRecord(existingOrder, ["algoId"]);
        if (!algoId) {
          return {
            duplicate: true,
            exchange: config.exchangeId,
            reason: "Matching Binance futures close-position algo order already exists but has no algoId to replace",
            wouldCall: "fapiPrivatePostAlgoOrder",
            params: payload,
            existingOrder
          };
        }

        const cancelParams: JsonRecord = {
          symbol: payload.symbol,
          algoId
        };
        if (payload.recvWindow !== undefined) {
          cancelParams.recvWindow = payload.recvWindow;
        }

        const canceledOrder = await invoke(exchange, "fapiPrivateDeleteAlgoOrder", [cancelParams]);
        const newOrder = await invoke(exchange, "fapiPrivatePostAlgoOrder", [payload]);
        return {
          replaced: true,
          exchange: config.exchangeId,
          canceledOrder,
          newOrder,
          replacedExistingOrder: existingOrder,
          params: payload
        };
      }

      return {
        duplicate: true,
        exchange: config.exchangeId,
        reason: "Matching Binance futures close-position algo order already exists",
        wouldCall: "fapiPrivatePostAlgoOrder",
        params: payload,
        existingOrder
      };
    }
  }

  return await invoke(exchange, "fapiPrivatePostAlgoOrder", [payload]);
}

async function cancelAcceptedBinanceProtections(
  exchange: ExchangeLike,
  symbol: unknown,
  protections: Array<{ kind: string; order: unknown }>
): Promise<unknown[]> {
  const rollback = [];
  for (const protection of protections) {
    const order = recordOrUndefined(protection.order);
    const algoId = order ? stringFromRecord(order, ["algoId"]) : undefined;
    if (!algoId) {
      rollback.push({ kind: protection.kind, skipped: true, reason: "Accepted protection has no algoId" });
      continue;
    }

    const result = await invoke(exchange, "fapiPrivateDeleteAlgoOrder", [
      {
        symbol,
        algoId
      }
    ]);
    rollback.push({ algoId, result });
  }
  return rollback;
}

async function createBinanceProtectedFuturesEntry(
  config: CcxtMcpConfig,
  exchange: ExchangeLike,
  args: JsonRecord | undefined
): Promise<unknown> {
  const plan = buildBinanceProtectedEntryPlan(config, args);
  if (!plan) {
    throw new Error("Protected futures entry is only supported for Binance futures with stopLoss and takeProfit.");
  }

  const stopLossPayload = plan.stopLossPayload as JsonRecord;
  const takeProfitPayload = plan.takeProfitPayload as JsonRecord;
  const entryArgs = Array.isArray(plan.entryArgs) ? plan.entryArgs : [];
  const extraParams = cleanParams(args?.params);
  const acceptedProtections: Array<{ kind: string; order: unknown }> = [];

  if (!config.enableTrading || config.dryRun) {
    return dryRunResult(config, "protectedFuturesEntry", {
      stopLoss: stopLossPayload,
      takeProfit: takeProfitPayload,
      entryArgs
    });
  }

  try {
    const stopLossOrder = await submitBinanceFuturesAlgoOrder(config, exchange, stopLossPayload, extraParams);
    acceptedProtections.push({ kind: "stopLoss", order: stopLossOrder });
    const takeProfitOrder = await submitBinanceFuturesAlgoOrder(config, exchange, takeProfitPayload, extraParams);
    acceptedProtections.push({ kind: "takeProfit", order: takeProfitOrder });
  } catch (error) {
    const rollback = await cancelAcceptedBinanceProtections(exchange, stopLossPayload.symbol, acceptedProtections);
    return protectedEntryError(config, args, acceptedProtections.length === 0 ? "stopLoss" : "takeProfit", error, rollback);
  }

  try {
    const entryOrder = await invoke(exchange, "createOrder", entryArgs);
    return {
      protectedEntry: true,
      exchange: config.exchangeId,
      symbol: optionalString(args, "symbol"),
      protections: {
        stopLoss: acceptedProtections[0],
        takeProfit: acceptedProtections[1]
      },
      entry: {
        method: "createOrder",
        args: entryArgs,
        order: entryOrder
      }
    };
  } catch (error) {
    const rollback = await cancelAcceptedBinanceProtections(exchange, stopLossPayload.symbol, acceptedProtections);
    return protectedEntryError(config, args, "entry", error, rollback, false);
  }
}

function recordOrUndefined(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function extractAlgoOrders(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.map(recordOrUndefined).filter((item): item is JsonRecord => Boolean(item));
  }

  const record = recordOrUndefined(value);
  if (!record) {
    return [];
  }

  for (const key of ["orders", "data", "result"]) {
    if (Array.isArray(record[key])) {
      return record[key].map(recordOrUndefined).filter((item): item is JsonRecord => Boolean(item));
    }
  }

  return [];
}

function stringFromRecord(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function upperString(value: unknown): string | undefined {
  return typeof value === "string" ? value.toUpperCase() : undefined;
}

function isTerminalAlgoStatus(status: string | undefined): boolean {
  return Boolean(status && ["CANCELED", "CANCELLED", "EXPIRED", "FINISHED", "REJECTED"].includes(status));
}

function findMatchingClosePositionAlgoOrder(openAlgoOrders: unknown, payload: JsonRecord): JsonRecord | undefined {
  if (optionalBooleanLike(payload, "closePosition") !== true) {
    return undefined;
  }

  const requestedSymbol = normalizeBinanceFuturesSymbol(upperString(payload.symbol));
  const requestedSide = upperString(payload.side);
  const requestedType = upperString(payload.type);
  const requestedPositionSide = upperString(payload.positionSide);

  return extractAlgoOrders(openAlgoOrders).find((order) => {
    const status = upperString(order.algoStatus ?? order.status);
    if (isTerminalAlgoStatus(status)) {
      return false;
    }

    const orderSymbol = normalizeBinanceFuturesSymbol(upperString(stringFromRecord(order, ["symbol"])));
    const orderSide = upperString(stringFromRecord(order, ["side"]));
    const orderType = upperString(stringFromRecord(order, ["orderType", "type", "origType"]));
    const orderPositionSide = upperString(stringFromRecord(order, ["positionSide"]));

    if (
      orderSymbol !== requestedSymbol ||
      orderSide !== requestedSide ||
      orderType !== requestedType ||
      optionalBooleanLike(order, "closePosition") !== true
    ) {
      return false;
    }

    return requestedPositionSide ? orderPositionSide === requestedPositionSide : true;
  });
}

async function invoke(exchange: ExchangeLike, method: string, args: unknown[] = []): Promise<unknown> {
  if (!methodIsCallable(exchange, method)) {
    throw new Error(`CCXT method is not available on this exchange: ${method}`);
  }

  const callable = exchange[method] as (...methodArgs: unknown[]) => unknown;
  return await callable.apply(exchange, args);
}

function serializeResult(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item instanceof Map) {
        return Object.fromEntries(item.entries());
      }
      return item;
    },
    2
  );
}

function extractObservedIp(response: unknown): string | undefined {
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const record = response as JsonRecord;
    return typeof record.ip === "string" ? record.ip : undefined;
  }

  if (typeof response !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(response) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as JsonRecord;
      return typeof record.ip === "string" ? record.ip : undefined;
    }
  } catch {
    return response.trim() || undefined;
  }

  return undefined;
}

export function createToolHandlers(config: CcxtMcpConfig, exchangeProvider: ExchangeProvider): ToolHandlers {
  async function withExchange<T>(fn: (exchange: ExchangeLike) => Promise<T>): Promise<T> {
    const exchange = exchangeProvider();
    await prepareExchange(exchange, config);
    return await fn(exchange);
  }

  const handlers: ToolHandlers = {
    ccxt_get_config: async () => redactConfig(config),

    ccxt_list_exchanges: async () => ({
      exchanges: listExchangeIds()
    }),

    ccxt_exchange_info: async () =>
      withExchange(async (exchange) => ({
        id: exchange.id,
        name: exchange.name,
        countries: exchange.countries,
        urls: exchange.urls,
        version: exchange.version,
        rateLimit: exchange.rateLimit,
        timeout: exchange.timeout,
        has: exchange.has,
        timeframes: exchange.timeframes,
        marketsLoaded: Boolean(exchange.markets)
      })),

    ccxt_proxy_ip: async () =>
      withExchange(async (exchange) => {
        const response = methodIsCallable(exchange, "fetch")
          ? await invoke(exchange, "fetch", [config.ipCheckUrl, "GET"])
          : await fetch(config.ipCheckUrl).then((fetchResponse) => fetchResponse.text());
        const observedIp = extractObservedIp(response);

        return {
          ipCheckUrl: config.ipCheckUrl,
          observedIp,
          whitelistIps: config.whitelistIps,
          whitelisted: observedIp ? config.whitelistIps.includes(observedIp) : false,
          response
        };
      }),

    ccxt_load_markets: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "loadMarkets", [Boolean(args?.reload), cleanParams(args?.params)])
      ),

    ccxt_fetch_ticker: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchTicker", [args?.symbol, cleanParams(args?.params)])
      ),

    ccxt_fetch_tickers: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchTickers", [args?.symbols, cleanParams(args?.params)])
      ),

    ccxt_fetch_ticker_summary: async (args) =>
      withExchange((exchange) => buildTickerSummary(exchange, args)),

    ccxt_fetch_order_book: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchOrderBook", [
          args?.symbol,
          optionalNumber(args, "limit"),
          cleanParams(args?.params)
        ])
      ),

    ccxt_fetch_trades: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchTrades", [
          args?.symbol,
          optionalNumber(args, "since"),
          optionalNumber(args, "limit"),
          cleanParams(args?.params)
        ])
      ),

    ccxt_fetch_ohlcv: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchOHLCV", [
          args?.symbol,
          optionalString(args, "timeframe"),
          optionalNumber(args, "since"),
          optionalNumber(args, "limit"),
          cleanParams(args?.params)
        ])
      ),

    ccxt_fetch_balance: async (args) =>
      withExchange((exchange) => invoke(exchange, "fetchBalance", [cleanParams(args?.params)])),

    ccxt_fetch_open_orders: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchOpenOrders", [
          optionalString(args, "symbol"),
          optionalNumber(args, "since"),
          optionalNumber(args, "limit"),
          cleanParams(args?.params)
        ])
      ),

    ccxt_fetch_open_algo_orders: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fapiPrivateGetOpenAlgoOrders", [buildBinanceOpenAlgoOrdersParams(args)])
      ),

    ccxt_cancel_algo_order: async (args) => {
      const params = buildBinanceCancelAlgoOrderParams(args);
      if (!config.enableTrading || config.dryRun) {
        return dryRunResult(config, "fapiPrivateDeleteAlgoOrder", params);
      }

      return await withExchange((exchange) => invoke(exchange, "fapiPrivateDeleteAlgoOrder", [params]));
    },

    ccxt_cancel_all_algo_orders: async (args) => {
      const params = buildBinanceOpenAlgoOrdersParams(args);
      if (!config.enableTrading || config.dryRun) {
        return dryRunResult(config, "fapiPrivateDeleteAlgoOpenOrders", params);
      }

      return await withExchange((exchange) => invoke(exchange, "fapiPrivateDeleteAlgoOpenOrders", [params]));
    },

    ccxt_fetch_closed_orders: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchClosedOrders", [
          optionalString(args, "symbol"),
          optionalNumber(args, "since"),
          optionalNumber(args, "limit"),
          cleanParams(args?.params)
        ])
      ),

    ccxt_fetch_order: async (args) =>
      withExchange((exchange) =>
        invoke(exchange, "fetchOrder", [args?.id, optionalString(args, "symbol"), cleanParams(args?.params)])
      ),

    ccxt_cancel_order: async (args) => {
      const params = {
        id: args?.id,
        symbol: optionalString(args, "symbol"),
        params: cleanParams(args?.params)
      };
      if (!config.enableTrading || config.dryRun) {
        return dryRunResult(config, "cancelOrder", params);
      }

      return await withExchange((exchange) =>
        invoke(exchange, "cancelOrder", [args?.id, optionalString(args, "symbol"), params.params])
      );
    },

    ccxt_create_order: async (args) => {
      const params = {
        symbol: args?.symbol,
        type: args?.type,
        side: args?.side,
        amount: args?.amount,
        price: optionalNumber(args, "price")
      };
      const extraParams = sanitizeBinanceFuturesHedgeOrderParams(config, cleanParams(args?.params));
      if (!config.enableTrading || config.dryRun) {
        return dryRunResult(config, "createOrder", params);
      }

      return await withExchange((exchange) =>
        invoke(exchange, "createOrder", [
          args?.symbol,
          args?.type,
          args?.side,
          args?.amount,
          optionalNumber(args, "price"),
          extraParams
        ])
      );
    },

    ccxt_create_protected_futures_entry: async (args) =>
      withExchange((exchange) => createBinanceProtectedFuturesEntry(config, exchange, args)),

    ccxt_fetch_binance_derivatives_sentiment: async (args) =>
      withExchange((exchange) => buildBinanceDerivativesSentiment(exchange, args)),

    ccxt_fetch_binance_global_long_short_account_ratio: async (args) =>
      withExchange((exchange) => fetchBinanceDerivativesData(exchange, "globalLongShortAccountRatio", args)),

    ccxt_fetch_binance_top_long_short_account_ratio: async (args) =>
      withExchange((exchange) => fetchBinanceDerivativesData(exchange, "topLongShortAccountRatio", args)),

    ccxt_fetch_binance_top_long_short_position_ratio: async (args) =>
      withExchange((exchange) => fetchBinanceDerivativesData(exchange, "topLongShortPositionRatio", args)),

    ccxt_fetch_binance_taker_long_short_ratio: async (args) =>
      withExchange((exchange) => fetchBinanceDerivativesData(exchange, "takerLongShortRatio", args)),

    ccxt_fetch_binance_open_interest_hist: async (args) =>
      withExchange((exchange) => fetchBinanceDerivativesData(exchange, "openInterestHist", args)),

    ccxt_call: async (args) => {
      const method = String(args?.method ?? "");
      const methodArgs = Array.isArray(args?.args) ? args.args : [];

      if (isMutatingMethod(method) && (!config.enableTrading || config.dryRun)) {
        return dryRunResult(config, method, { args: methodArgs });
      }

      return await withExchange((exchange) => invoke(exchange, method, methodArgs));
    }
  };

  for (const spec of methodToolSpecs) {
    handlers[spec.name] = async (args) => {
      if (
        spec.name === "ccxt_create_order_with_take_profit_and_stop_loss" &&
        buildBinanceProtectedEntryPlan(config, args)
      ) {
        return await withExchange((exchange) => createBinanceProtectedFuturesEntry(config, exchange, args));
      }

      const binanceAlgoPayload = buildBinanceFuturesAlgoOrder(config, spec.name, args);
      if (binanceAlgoPayload) {
        if (spec.mutating && (!config.enableTrading || config.dryRun)) {
          return dryRunResult(config, "fapiPrivatePostAlgoOrder", binanceAlgoPayload);
        }

        return await withExchange(async (exchange) => {
          const extraParams = cleanParams(args?.params);
          return await submitBinanceFuturesAlgoOrder(config, exchange, binanceAlgoPayload, extraParams);
        });
      }

      const fallbackInvocation = binanceFuturesHedgeReduceOnlyFallback(config, spec, args);
      const method = fallbackInvocation?.method ?? spec.method;
      const methodArgs = fallbackInvocation?.args ?? sanitizeFinalParamsArg(config, spec.buildArgs(args));

      if (spec.mutating && (!config.enableTrading || config.dryRun)) {
        return dryRunResult(config, method, { args: methodArgs });
      }

      return await withExchange((exchange) => invoke(exchange, method, methodArgs));
    };
  }

  return handlers;
}

export function registerCcxtTools(server: McpServer, handlers: ToolHandlers): void {
  for (const definition of toolDefinitions) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema
      },
      async (args) => {
        try {
          const result = await handlers[definition.name]?.(args as JsonRecord);
          return {
            content: [
              {
                type: "text" as const,
                text: serializeResult(result)
              }
            ]
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text" as const,
                text: message
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
