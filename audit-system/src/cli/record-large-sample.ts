import type { AuditEventInput, AuditPhase } from "../shared/types.js";
import { AuditRecorder } from "../core/recorder.js";
import { AuditStore } from "../core/store.js";
import { auditDataDir } from "./env.js";

const symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "BNB/USDT:USDT", "DOGE/USDT:USDT"];
const phasePlan: Array<{ phase: AuditPhase; type: AuditEventInput["type"] }> = [
  { phase: "strategy", type: "strategy.loaded" },
  { phase: "preflight", type: "mcp.call" },
  { phase: "market", type: "market.snapshot" },
  { phase: "analysis", type: "analysis.noted" },
  { phase: "candidate", type: "candidate.ranked" },
  { phase: "decision", type: "intent.decided" },
  { phase: "risk", type: "risk.sized" },
  { phase: "action", type: "action.planned" },
  { phase: "execution", type: "order.dry_run" },
  { phase: "verification", type: "post.verify" }
];

const cycleCount = intEnv("AUDIT_LARGE_CYCLES", 120);
const eventsPerCycle = intEnv("AUDIT_LARGE_EVENTS", 80);
const dataDir = auditDataDir();
const store = new AuditStore({ dataDir });
const startedAt = new Date();

for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
  const cycleId = `large-${startedAt.toISOString().replace(/[:.]/g, "-")}-${String(cycleIndex + 1).padStart(4, "0")}`;
  const recorder = new AuditRecorder(store, cycleId);
  const primarySymbol = symbols[cycleIndex % symbols.length]!;
  recorder.start({
    fixture: "large",
    cycleIndex,
    primarySymbol,
    generatedAt: startedAt.toISOString()
  });

  const bodyEvents = Math.max(0, eventsPerCycle - 2);
  for (let eventIndex = 0; eventIndex < bodyEvents; eventIndex += 1) {
    const phaseItem = phasePlan[eventIndex % phasePlan.length]!;
    const symbol = symbols[(cycleIndex + eventIndex) % symbols.length]!;
    recorder.record({
      type: phaseItem.type,
      phase: phaseItem.phase,
      summary: `${phaseItem.phase} fixture event ${eventIndex + 1} for ${symbol}`,
      symbol,
      payload: {
        fixture: "large",
        cycleIndex,
        eventIndex,
        symbol,
        metrics: {
          score: (cycleIndex * 17 + eventIndex * 7) % 100,
          liquidityRank: (eventIndex % 10) + 1,
          spreadBps: Number((0.5 + (eventIndex % 8) * 0.15).toFixed(2))
        },
        notes: [
          `phase=${phaseItem.phase}`,
          `symbol=${symbol}`,
          "local fixture only; no exchange or MCP call"
        ]
      },
      tags: ["large-fixture", phaseItem.phase]
    });
  }

  recorder.finalize(`Large fixture cycle ${cycleIndex + 1} finalized`, {
    fixture: "large",
    cycleIndex,
    primarySymbol,
    eventTarget: eventsPerCycle,
    nextRoundFocus: ["validate pagination", "validate lazy payload loading", "validate virtual lists"]
  });
}

console.log(JSON.stringify({ dataDir, cycleCount, eventsPerCycle }));
store.close();

function intEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
