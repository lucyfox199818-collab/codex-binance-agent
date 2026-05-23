import { AuditRecorder } from "../core/recorder.js";
import { AuditStore } from "../core/store.js";
import { auditDataDir } from "./env.js";

const cycleId = `sample-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const store = new AuditStore({ dataDir: auditDataDir() });
const recorder = new AuditRecorder(store, cycleId);

recorder.start({
  exchange: "binance",
  dryRun: true,
  strategy: "V2"
});

recorder.record({
  type: "mcp.call",
  phase: "preflight",
  summary: "Fetched account, positions and protection orders",
  payload: {
    tool: "ccxt_fetch_balance",
    durationMs: 120,
    response: {
      total: { USDT: 100 },
      apiKey: "sample-secret"
    }
  },
  tags: ["account", "mcp"]
});

recorder.record({
  type: "market.snapshot",
  phase: "market",
  summary: "Loaded broad market snapshot and seed symbols",
  payload: {
    eligibleCount: 186,
    longTop: ["BTC/USDT:USDT", "ETH/USDT:USDT"],
    shortTop: ["DOGE/USDT:USDT"],
    funding: { "BTC/USDT:USDT": 0.0001 }
  },
  tags: ["market"]
});

recorder.record({
  type: "candidate.ranked",
  phase: "candidate",
  summary: "BTC ranked first on liquidity and momentum",
  symbol: "BTC/USDT:USDT",
  payload: {
    rank: 1,
    scoreInputs: {
      liquidityRank: 1,
      momentumRank: 2,
      spreadBps: 1.2
    }
  },
  tags: ["candidate", "long"]
});

recorder.record({
  type: "cta.decided",
  phase: "cta",
  summary: "BTC CTA passed with clear invalidation",
  symbol: "BTC/USDT:USDT",
  payload: {
    decision: "pass",
    direction: "long",
    confidence: "high",
    invalidation: 106000,
    takeProfit: 108500
  },
  tags: ["cta", "long"]
});

recorder.record({
  type: "risk.sized",
  phase: "risk",
  summary: "Position size fits V2 risk constraints",
  symbol: "BTC/USDT:USDT",
  payload: {
    leverage: 5,
    marginUsdt: 12,
    notionalUsdt: 60,
    maxLossUsdt: 1.8,
    rr: 1.7
  },
  tags: ["risk"]
});

recorder.record({
  type: "execution.planned",
  phase: "execution",
  summary: "Prepared protected dry-run order",
  symbol: "BTC/USDT:USDT",
  payload: {
    entry: 107000,
    stopLoss: 106000,
    takeProfit: 108500,
    protection: "entry_with_tp_sl"
  },
  tags: ["execution"]
});

recorder.record({
  type: "order.dry_run",
  phase: "execution",
  summary: "Dry-run order accepted by local gate",
  symbol: "BTC/USDT:USDT",
  payload: {
    dryRun: true,
    orderId: "dry-run-order-1",
    protectionOrderIds: ["dry-run-sl-1", "dry-run-tp-1"]
  },
  tags: ["execution", "dry-run"]
});

recorder.record({
  type: "post.verify",
  phase: "verification",
  summary: "Post-action verification confirmed protected state",
  symbol: "BTC/USDT:USDT",
  payload: {
    positions: [{ symbol: "BTC/USDT:USDT", side: "long", size: 0.001 }],
    openOrders: [],
    protectionOrders: ["dry-run-sl-1", "dry-run-tp-1"]
  },
  tags: ["verification"]
});

recorder.finalize("Sample cycle finalized", {
  result: "dry_run",
  next: "monitor protection and early profit lock"
});

console.log(JSON.stringify({ cycleId, dataDir: auditDataDir() }));
store.close();
