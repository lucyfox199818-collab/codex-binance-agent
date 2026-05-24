import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AuditRecorder } from "../src/core/recorder.js";
import { AuditStore } from "../src/core/store.js";

async function tempAuditDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "audit-v3-"));
}

describe("V3 strategy audit compatibility", () => {
  it("stores free-form analysis, intent and action events without requiring fixed candidate or trigger stages", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    const recorder = new AuditRecorder(store, "v3-cycle");

    recorder.record({
      type: "strategy.loaded",
      phase: "strategy",
      summary: "Loaded V3 free-discretion strategy",
      payload: { strategyFile: "V3.txt" }
    });
    recorder.record({
      type: "analysis.noted",
      phase: "analysis",
      summary: "AI selected BTC and SOL for direct review",
      payload: {
        inspected: ["BTC/USDT:USDT", "SOL/USDT:USDT"],
        reason: "volatility and liquidity"
      }
    });
    recorder.record({
      type: "intent.decided",
      phase: "intent",
      summary: "Wait on BTC, dry-run long SOL",
      symbol: "SOL/USDT:USDT",
      payload: {
        actions: [
          { symbol: "BTC/USDT:USDT", action: "wait" },
          { symbol: "SOL/USDT:USDT", action: "open_long", mode: "dry_run" }
        ]
      }
    });
    recorder.record({
      type: "future-v3.edge-model.changed",
      phase: "decision",
      summary: "Future V3 variant recorded a custom decision event",
      symbol: "SOL/USDT:USDT",
      payload: {
        schemaVersion: "future-v3",
        arbitraryDecisionShape: {
          edgeModel: "liquidity-regime",
          action: "keep_intent"
        }
      }
    });
    recorder.record({
      type: "action.planned",
      phase: "action",
      summary: "Prepared SOL protected dry-run order",
      symbol: "SOL/USDT:USDT",
      payload: { marginUsdt: 10, leverage: 5, stop: 175.4, maxLossPct: 0.8 }
    });
    recorder.record({
      type: "action.executed",
      phase: "action",
      summary: "SOL dry-run action recorded",
      symbol: "SOL/USDT:USDT",
      payload: { dryRun: true, orderId: "v3-dry-run-sol" }
    });
    recorder.finalize("V3 cycle finalized", {
      strategyFile: "V3.txt",
      config: { exchange: "binance", enableTrading: true, dryRun: true },
      accountSummary: { equity: 100, available: 90, positions: 0, openOrders: 0, protections: 0 },
      portfolioDecision: "Wait on BTC and dry-run protected SOL long after free-form review",
      actions: [{ symbol: "SOL/USDT:USDT", action: "open_long", mode: "dry_run" }],
      nextRoundFocus: ["verify protection state", "review BTC wait condition"]
    });

    const report = store.getCycleReport("v3-cycle");
    expect(report.cycle.symbols).toEqual(["SOL/USDT:USDT"]);
    expect(report.analysisEvents.map((event) => event.type)).toEqual(["analysis.noted"]);
    expect(report.decisionEvents.map((event) => event.type)).toEqual([
      "intent.decided",
      "future-v3.edge-model.changed"
    ]);
    expect(report.actionEvents.map((event) => event.type)).toEqual(["action.planned", "action.executed"]);
    expect(report.candidates).toEqual([]);
    expect(store.verifyCycle("v3-cycle").ok).toBe(true);
    store.close();
  });

  it("rejects a V3 finalized summary that omits required review fields", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    store.appendEvent({
      cycleId: "v3-incomplete-summary",
      type: "cycle.started",
      phase: "cycle",
      summary: "Started V3 audit cycle",
      payload: { strategyFile: "V3.txt" },
      tags: ["v3"]
    });
    store.appendEvent({
      cycleId: "v3-incomplete-summary",
      type: "summary.finalized",
      phase: "summary",
      summary: "V3 summary finalized without enough detail",
      payload: { strategyFile: "V3.txt" },
      tags: ["v3"]
    });

    const verification = store.verifyCycle("v3-incomplete-summary");
    expect(verification.ok).toBe(false);
    expect(verification.reason).toContain("incomplete V3 final summary");
    expect(verification.reason).toContain("accountSummary");
    store.close();
  });
});
