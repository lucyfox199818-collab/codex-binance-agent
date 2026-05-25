import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { hashPayload } from "../src/core/hash.js";
import { redactSecrets } from "../src/core/redact.js";
import { AuditStore } from "../src/core/store.js";

async function tempAuditDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "audit-core-"));
}

describe("audit core", () => {
  it("redacts secret fields recursively while preserving reviewable trading fields", () => {
    const redacted = redactSecrets({
      apiKey: "abc",
      secret: "def",
      proxyUrl: "socks5://user:pass@example",
      orderId: "12345",
      balance: { total: 42, token: "hidden" },
      nested: [{ authorization: "bearer token", symbol: "BTC/USDT:USDT" }]
    });

    expect(redacted).toEqual({
      apiKey: "[REDACTED]",
      secret: "[REDACTED]",
      proxyUrl: "[REDACTED]",
      orderId: "12345",
      balance: { total: 42, token: "[REDACTED]" },
      nested: [{ authorization: "[REDACTED]", symbol: "BTC/USDT:USDT" }]
    });
  });

  it("creates stable payload hashes independent of object key order", () => {
    const first = hashPayload({ b: 2, a: { d: 4, c: 3 } });
    const second = hashPayload({ a: { c: 3, d: 4 }, b: 2 });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("appends events to SQLite, JSONL and gzipped payload blobs", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const started = store.appendEvent({
      cycleId: "cycle-1",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { apiKey: "abc", equity: 100 },
      tags: ["live"]
    });
    const cta = store.appendEvent({
      cycleId: "cycle-1",
      type: "cta.decided",
      phase: "cta",
      summary: "BTC CTA passed",
      symbol: "BTC/USDT:USDT",
      payload: { symbol: "BTC/USDT:USDT", confidence: "high" }
    });

    expect(started.sequence).toBe(1);
    expect(cta.sequence).toBe(2);
    expect(cta.previousHash).toBe(started.eventHash);

    const cycles = store.listCycles();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      cycleId: "cycle-1",
      status: "running",
      eventCount: 2,
      symbols: ["BTC/USDT:USDT"]
    });

    const events = store.listEvents("cycle-1");
    expect(events.map((event) => event.type)).toEqual(["cycle.started", "cta.decided"]);

    const payload = store.getPayload(started.eventId);
    expect(payload).toEqual({ apiKey: "[REDACTED]", equity: 100 });

    const jsonlPath = path.join(dataDir, "events", `${started.timestamp.slice(0, 10)}.jsonl`);
    const jsonl = await readFile(jsonlPath, "utf8");
    expect(jsonl).toContain(started.eventId);
    expect(jsonl).toContain(cta.eventId);

    const blobs = await readdir(path.join(dataDir, "blobs"));
    expect(blobs).toContain(`${started.payloadHash}.json.gz`);

    store.close();
  });

  it("verifies the per-cycle hash chain and detects tampering", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    store.appendEvent({
      cycleId: "cycle-2",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });
    const second = store.appendEvent({
      cycleId: "cycle-2",
      type: "summary.finalized",
      phase: "summary",
      summary: "summary finalized",
      payload: { result: "done" }
    });

    expect(store.verifyCycle("cycle-2")).toMatchObject({ ok: true, checkedEvents: 2 });
    store.close();

    const db = new DatabaseSync(path.join(dataDir, "trading-audit.sqlite"));
    db.prepare("UPDATE events SET summary = ? WHERE event_id = ?").run("tampered", second.eventId);
    db.close();

    const reopened = new AuditStore({ dataDir });
    expect(reopened.verifyCycle("cycle-2")).toMatchObject({
      ok: false,
      checkedEvents: 2,
      brokenAtEventId: second.eventId
    });
    reopened.close();
  });

  it("requires every cycle to end with a finalized summary", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    store.appendEvent({
      cycleId: "cycle-missing-summary",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });

    expect(store.verifyCycle("cycle-missing-summary")).toMatchObject({
      ok: false,
      checkedEvents: 1,
      reason: "missing summary.finalized"
    });
    store.close();
  });

  it("does not mark a planned no-submit action as execution", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    store.appendEvent({
      cycleId: "cycle-no-submit-plan",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });
    store.appendEvent({
      cycleId: "cycle-no-submit-plan",
      type: "action.planned",
      phase: "execution",
      summary: "final quote drifted beyond limit; no submit",
      payload: { result: "no-submit" }
    });

    expect(store.getCycle("cycle-no-submit-plan")?.hasExecution).toBe(false);
    store.close();
  });

  it("does not mark no-order dry-run audit markers as execution", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    store.appendEvent({
      cycleId: "cycle-no-order-dry-run",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });
    store.appendEvent({
      cycleId: "cycle-no-order-dry-run",
      type: "order.dry_run",
      phase: "execution",
      summary: "No dry-run or live order submitted; V2 gates produced no executable plan.",
      payload: { submitted: false },
      tags: ["v2", "execution", "no_order"]
    });

    store.appendEvent({
      cycleId: "cycle-real-dry-run",
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });
    store.appendEvent({
      cycleId: "cycle-real-dry-run",
      type: "order.dry_run",
      phase: "execution",
      summary: "Dry-run order accepted",
      payload: { submitted: true },
      tags: ["v2", "execution"]
    });

    expect(store.getCycle("cycle-no-order-dry-run")?.hasExecution).toBe(false);
    expect(store.getCycle("cycle-real-dry-run")?.hasExecution).toBe(true);
    store.close();
  });

  it("repairs stale execution flags from persisted events", async () => {
    const dataDir = await tempAuditDir();
    const cycleId = "cycle-stale-no-order";
    const store = new AuditStore({ dataDir });

    store.appendEvent({
      cycleId,
      type: "cycle.started",
      phase: "cycle",
      summary: "cycle started",
      payload: { ok: true }
    });
    store.appendEvent({
      cycleId,
      type: "order.dry_run",
      phase: "execution",
      summary: "Cycle submitted no dry-run or live order.",
      payload: { submitted: false },
      tags: ["v2", "execution", "no_order"]
    });
    store.close();

    const db = new DatabaseSync(path.join(dataDir, "trading-audit.sqlite"));
    db.prepare("UPDATE cycles SET has_execution = 1 WHERE cycle_id = ?").run(cycleId);
    db.close();

    const reopened = new AuditStore({ dataDir });
    expect(reopened.getCycle(cycleId)?.hasExecution).toBe(true);
    expect(reopened.repairExecutionFlags(cycleId)).toEqual({ checked: 1, updated: 1 });
    expect(reopened.getCycle(cycleId)?.hasExecution).toBe(false);
    reopened.close();
  });

  it("does not report overview gaps for detailed phase names", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    const cycleId = "v2-detailed-phase-cycle";

    store.appendEvent({
      cycleId,
      type: "cycle.started",
      phase: "cycle.start",
      summary: "cycle started",
      payload: { ok: true }
    });
    store.appendEvent({
      cycleId,
      type: "mcp.call",
      phase: "preflight.account_orders_protection",
      summary: "fetched account, positions, orders and protection state",
      payload: { calls: [{ tool: "ccxt_fetch_balance", params_summary: {}, return_summary: {}, latency_ms: 10, error: null }] }
    });
    store.appendEvent({
      cycleId,
      type: "market.snapshot",
      phase: "market.scan.snapshot",
      summary: "selected market snapshot",
      payload: { eligibleMarkets: 10 }
    });
    store.appendEvent({
      cycleId,
      type: "candidate.ranked",
      phase: "selection.cross_section_ranking",
      summary: "candidate ranking completed",
      payload: { ranked: [] }
    });
    store.appendEvent({
      cycleId,
      type: "cta.decided",
      phase: "decision.cta",
      summary: "CTA decision: no trade",
      payload: { decision: "no_trade" }
    });
    store.appendEvent({
      cycleId,
      type: "risk.sized",
      phase: "decision.risk",
      summary: "risk decision: zero size",
      payload: { size: 0 }
    });
    store.appendEvent({
      cycleId,
      type: "execution.aborted",
      phase: "execution.no_trade_abort",
      summary: "explicitly abandoned execution because no setup passed",
      payload: { mutating_call_submitted: false }
    });
    store.appendEvent({
      cycleId,
      type: "post.verify",
      phase: "post_decision.verify",
      summary: "post-decision verification confirmed flat account",
      payload: { positions: [], open_orders: [] }
    });
    store.appendEvent({
      cycleId,
      type: "summary.finalized",
      phase: "summary.finalized",
      summary: "cycle finalized",
      payload: { result: "no_trade" }
    });

    expect(store.getCycleOverview(cycleId).gaps).toEqual([]);
    store.close();
  });

  it("records and clears cooldowns with default and explicit durations", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const stop = store.setCooldown({
      symbol: "HYPE/USDT:USDT",
      side: "long",
      reason: "stop",
      cycleId: "v2-cooldown-1",
      notes: "stopped at 58.56"
    });
    expect(stop.untilTs > stop.startedAt).toBe(true);
    expect(Date.parse(stop.untilTs) - Date.parse(stop.startedAt)).toBe(30 * 60 * 1000);

    expect(store.checkCooldown("HYPE/USDT:USDT", "long")).toMatchObject({
      blocked: true,
      remainingSeconds: expect.any(Number)
    });
    expect(store.checkCooldown("HYPE/USDT:USDT", "short")).toMatchObject({ blocked: false });
    expect(store.checkCooldown("OTHER/USDT:USDT", "long")).toMatchObject({ blocked: false });

    const both = store.setCooldown({
      symbol: "PLUME/USDT:USDT",
      side: "both",
      reason: "abort",
      durationSeconds: 60
    });
    expect(both.side).toBe("both");
    expect(store.checkCooldown("PLUME/USDT:USDT", "long").blocked).toBe(true);
    expect(store.checkCooldown("PLUME/USDT:USDT", "short").blocked).toBe(true);

    const cleared = store.clearCooldown("HYPE/USDT:USDT", "long");
    expect(cleared).toBe(1);
    expect(store.checkCooldown("HYPE/USDT:USDT", "long").blocked).toBe(false);

    store.close();
  });

  it("supersedes earlier cooldown entries when a new one is set for the same side", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const first = store.setCooldown({
      symbol: "NEAR/USDT:USDT",
      side: "long",
      reason: "abort",
      durationSeconds: 30
    });
    const second = store.setCooldown({
      symbol: "NEAR/USDT:USDT",
      side: "long",
      reason: "stop",
      durationSeconds: 120
    });

    const active = store.listActiveCooldowns("NEAR/USDT:USDT");
    expect(active).toHaveLength(1);
    expect(active[0]!.cooldownId).toBe(second.cooldownId);

    const all = store.listAllCooldowns();
    const previous = all.find((row) => row.cooldownId === first.cooldownId);
    expect(previous?.clearedAt).toBeTruthy();
    expect(previous?.clearReason).toBe("superseded_by_new_entry");

    store.close();
  });

  it("rejects invalid or zero-duration cooldown writes without clearing active entries", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const stop = store.setCooldown({
      symbol: "TIA/USDT:USDT",
      side: "long",
      reason: "stop",
      durationSeconds: 120
    });

    expect(() =>
      store.setCooldown({
        symbol: "TIA/USDT:USDT",
        side: "long",
        reason: "tp_close" as never
      })
    ).toThrow(/Unsupported cooldown reason/);
    expect(() =>
      store.setCooldown({
        symbol: "TIA/USDT:USDT",
        side: "long",
        reason: "stop",
        durationSeconds: 0
      })
    ).toThrow(/Cooldown duration must be positive/);

    const active = store.listActiveCooldowns("TIA/USDT:USDT");
    expect(active).toHaveLength(1);
    expect(active[0]!.cooldownId).toBe(stop.cooldownId);
    expect(store.checkCooldown("TIA/USDT:USDT", "long").blocked).toBe(true);

    store.close();
  });

  it("does not clear a both-side cooldown from a side-specific clear", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    store.setCooldown({
      symbol: "PLUME/USDT:USDT",
      side: "both",
      reason: "external",
      durationSeconds: 300
    });

    expect(store.clearCooldown("PLUME/USDT:USDT", "long")).toBe(0);
    expect(store.checkCooldown("PLUME/USDT:USDT", "long").blocked).toBe(true);
    expect(store.checkCooldown("PLUME/USDT:USDT", "short").blocked).toBe(true);

    expect(store.clearCooldown("PLUME/USDT:USDT", "both")).toBe(1);
    expect(store.checkCooldown("PLUME/USDT:USDT", "long").blocked).toBe(false);
    expect(store.checkCooldown("PLUME/USDT:USDT", "short").blocked).toBe(false);

    store.close();
  });

  it("persists manual-clear provenance on cleared cooldown entries", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const cooldown = store.setCooldown({
      symbol: "WIF/USDT:USDT",
      side: "short",
      reason: "abort",
      durationSeconds: 300
    });

    expect(
      store.clearCooldown("WIF/USDT:USDT", "short", {
        cycleId: "v2-clear-1",
        notes: "15m/1h formed a new structure with a new invalidation level"
      })
    ).toBe(1);

    const cleared = store.listAllCooldowns().find((entry) => entry.cooldownId === cooldown.cooldownId);
    expect(cleared).toMatchObject({
      clearReason: "manual_clear",
      clearCycleId: "v2-clear-1",
      clearNotes: "15m/1h formed a new structure with a new invalidation level"
    });

    store.close();
  });

  it("treats expired cooldowns as not blocking even before manual clear", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });

    const past = new Date(Date.now() - 60 * 1000).toISOString();
    store.setCooldown({
      symbol: "LIT/USDT:USDT",
      side: "long",
      reason: "stop",
      durationSeconds: 30,
      startedAt: past
    });

    expect(store.checkCooldown("LIT/USDT:USDT", "long")).toMatchObject({ blocked: false });
    store.close();
  });
});
