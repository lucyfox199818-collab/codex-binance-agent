import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AuditStore } from "../src/core/store.js";
import { analyzeCycles, analyzeTradingDecisions, getCycleDigest } from "../src/mcp/analysis.js";

describe("audit analysis MCP helpers", () => {
  it("aggregates local audit data without mutating it", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "audit-analysis-"));
    const store = new AuditStore({ dataDir });
    try {
      store.appendEvent({
        cycleId: "cycle-1",
        type: "cycle.started",
        phase: "cycle",
        summary: "started",
        payload: {}
      });
      store.appendEvent({
        cycleId: "cycle-1",
        type: "cta.decided",
        phase: "cta",
        summary: "no trade",
        symbol: "BTC/USDT:USDT",
        payload: { cta: "reject", reason: "funding_window_blocked" }
      });
      store.appendEvent({
        cycleId: "cycle-1",
        type: "risk.sized",
        phase: "risk",
        summary: "risk blocked",
        symbol: "BTC/USDT:USDT",
        payload: { gate_result: "blocked_by_funding" }
      });
      store.appendEvent({
        cycleId: "cycle-1",
        type: "summary.finalized",
        phase: "summary",
        summary: "final",
        payload: { decision: "wait" }
      });

      const cycles = analyzeCycles({ dataDir }, { limit: 10 });
      const decisions = analyzeTradingDecisions({ dataDir }, { limit: 10, symbol: "BTC/USDT:USDT" });
      const digest = getCycleDigest({ dataDir }, { cycleId: "cycle-1", includeFinalSummaryPayload: true });

      expect(cycles.cycles).toMatchObject({ analyzed: 1, completed: 1 });
      expect(cycles.events).toMatchObject({ analyzed: 4 });
      expect(decisions.ctaDecisions).toContainEqual({ key: "reject", count: 1 });
      expect(decisions.riskGates).toContainEqual({ key: "blocked_by_funding", count: 1 });
      expect(digest.counts).toMatchObject({ candidates: 1, risk: 1, summary: 1 });
      expect(digest.finalSummaryPayload).toEqual({ decision: "wait" });
    } finally {
      store.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
