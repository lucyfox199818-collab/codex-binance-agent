import { AuditRecorder } from "../core/recorder.js";
import { AuditStore } from "../core/store.js";
import { auditDataDir } from "./env.js";

const cycleId = `v3-sample-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const store = new AuditStore({ dataDir: auditDataDir() });
const recorder = new AuditRecorder(store, cycleId);

recorder.record({
  type: "strategy.loaded",
  phase: "strategy",
  summary: "Loaded V3 free-discretion strategy",
  payload: {
    strategyFile: "V3.txt",
    fixedPipeline: false,
    auditRequired: true
  },
  tags: ["strategy", "v3"]
});

recorder.record({
  type: "mcp.call",
  phase: "preflight",
  summary: "Fetched account and protection state for V3 round",
  payload: {
    tools: ["ccxt_get_config", "ccxt_fetch_balance", "ccxt_fetch_positions", "ccxt_fetch_open_orders"],
    accountReady: true,
    dryRun: true
  },
  tags: ["mcp", "account"]
});

recorder.record({
  type: "analysis.noted",
  phase: "analysis",
  summary: "AI selected BTC and SOL based on current volatility, liquidity and account context",
  payload: {
    inspectedData: ["balance", "positions", "tickers", "funding", "orderBook"],
    focusSymbols: ["BTC/USDT:USDT", "SOL/USDT:USDT"],
    rejected: [{ symbol: "DOGE/USDT:USDT", reason: "spread too wide for planned risk" }]
  },
  tags: ["analysis", "v3"]
});

recorder.record({
  type: "intent.decided",
  phase: "intent",
  summary: "Wait on BTC and dry-run protected SOL long",
  symbol: "SOL/USDT:USDT",
  payload: {
    intents: [
      { symbol: "BTC/USDT:USDT", action: "wait", reason: "entry not better than waiting" },
      { symbol: "SOL/USDT:USDT", action: "open_long", mode: "dry_run", reason: "clear invalidation and liquidity" }
    ]
  },
  tags: ["intent", "v3"]
});

recorder.record({
  type: "risk.sized",
  phase: "risk",
  summary: "SOL risk fits V3 hard boundaries",
  symbol: "SOL/USDT:USDT",
  payload: {
    marginUsdt: 10,
    leverage: 5,
    notionalUsdt: 50,
    maxLossPctOfEquity: 0.8,
    stopLoss: 175.4,
    exitPlan: "stop loss plus active review if order book thins"
  },
  tags: ["risk", "v3"]
});

recorder.record({
  type: "action.planned",
  phase: "action",
  summary: "Prepared protected SOL dry-run order",
  symbol: "SOL/USDT:USDT",
  payload: {
    orderType: "limit",
    side: "buy",
    amount: 0.28,
    limitPrice: 178.2,
    stopLoss: 175.4,
    reduceOnlyProtection: true
  },
  tags: ["action", "dry-run"]
});

recorder.record({
  type: "action.executed",
  phase: "action",
  summary: "Recorded SOL dry-run action",
  symbol: "SOL/USDT:USDT",
  payload: {
    dryRun: true,
    orderId: "v3-sol-dry-run-entry",
    protectionOrderIds: ["v3-sol-dry-run-sl"]
  },
  tags: ["action", "dry-run"]
});

recorder.record({
  type: "post.verify",
  phase: "verification",
  summary: "Verified V3 dry-run state and protection plan",
  symbol: "SOL/USDT:USDT",
  payload: {
    positions: [{ symbol: "SOL/USDT:USDT", side: "long", dryRun: true }],
    openOrders: [],
    protectionState: "planned"
  },
  tags: ["verification", "v3"]
});

recorder.finalize("V3 sample cycle finalized", {
  strategyFile: "V3.txt",
  config: {
    exchange: "binance",
    enableTrading: false,
    dryRun: true
  },
  auditStatus: "hash chain complete",
  accountSummary: {
    accountReady: true,
    positions: 0,
    openOrders: 0,
    protectionState: "planned"
  },
  portfolioDecision: "Wait on BTC and prepare a protected SOL dry-run long after free-form review",
  actions: [
    {
      symbol: "BTC/USDT:USDT",
      action: "wait",
      reason: "entry not better than waiting"
    },
    {
      symbol: "SOL/USDT:USDT",
      action: "open_long",
      mode: "dry_run",
      protection: "planned stop loss"
    }
  ],
  nextRoundFocus: ["review SOL protection", "re-check BTC wait condition"]
});

console.log(JSON.stringify({ cycleId, dataDir: auditDataDir() }));
store.close();
