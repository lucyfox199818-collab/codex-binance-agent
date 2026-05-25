import { mkdtemp } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuditRecorder } from "../src/core/recorder.js";
import { AuditStore } from "../src/core/store.js";
import { createAuditServer } from "../src/server/api.js";
import type { AuditPhase, AuditEventInput } from "../src/shared/types.js";

async function tempAuditDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "audit-server-"));
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unexpected test server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function getJson<T>(baseUrl: string, pathname: string): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

function appendCompletedCycle(
  store: AuditStore,
  cycleId: string,
  symbol: string,
  events: Array<{ phase: AuditPhase; type: string; summary: string }>
): void {
  store.appendEvent({
    cycleId,
    type: "cycle.started",
    phase: "cycle",
    summary: `${cycleId} started`,
    symbol,
    payload: { symbol }
  });
  for (const event of events) {
    store.appendEvent({
      cycleId,
      type: event.type as AuditEventInput["type"],
      phase: event.phase,
      summary: event.summary,
      symbol,
      payload: { symbol, phase: event.phase, summary: event.summary }
    });
  }
  store.appendEvent({
    cycleId,
    type: "summary.finalized",
    phase: "summary",
    summary: `${cycleId} finalized`,
    symbol,
    payload: { result: "done", symbol }
  });
}

describe("audit server", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
  });

  it("serves cycles, events, payloads, reports, symbol decisions, diffs, notes and verification", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    const recorder = new AuditRecorder(store, "server-cycle");
    const started = recorder.start({ equity: 100 });
    recorder.record({
      type: "candidate.ranked",
      phase: "candidate",
      summary: "BTC candidate ranked",
      symbol: "BTC/USDT:USDT",
      payload: { rank: 1, score: 91 }
    });
    const cta = recorder.record({
      type: "cta.decided",
      phase: "cta",
      summary: "BTC CTA passed",
      symbol: "BTC/USDT:USDT",
      payload: { decision: "pass", confidence: "high", score: 94 }
    });
    recorder.record({
      type: "execution.planned",
      phase: "execution",
      summary: "dry-run execution planned",
      symbol: "BTC/USDT:USDT",
      payload: { entry: 100, stop: 98, target: 104 }
    });
    recorder.finalize("server cycle finalized", { result: "done" });
    store.close();

    server = createAuditServer({ dataDir });
    const baseUrl = await listen(server);

    const cycles = await getJson<Array<{ cycleId: string; eventCount: number }>>(baseUrl, "/api/cycles");
    expect(cycles).toMatchObject([{ cycleId: "server-cycle", eventCount: 5 }]);

    const cycle = await getJson<{ cycleId: string; status: string }>(baseUrl, "/api/cycles/server-cycle");
    expect(cycle).toMatchObject({ cycleId: "server-cycle", status: "completed" });

    const events = await getJson<Array<{ eventId: string; type: string }>>(baseUrl, "/api/cycles/server-cycle/events");
    expect(events.map((event) => event.type)).toEqual([
      "cycle.started",
      "candidate.ranked",
      "cta.decided",
      "execution.planned",
      "summary.finalized"
    ]);

    const payload = await getJson<Record<string, unknown>>(baseUrl, `/api/events/${started.eventId}/payload`);
    expect(payload).toEqual({ equity: 100 });

    const symbolDecisions = await getJson<Array<{ symbol: string; summary: string }>>(
      baseUrl,
      `/api/symbols/${encodeURIComponent("BTC/USDT:USDT")}/decisions`
    );
    expect(symbolDecisions.map((decision) => decision.summary)).toContain("BTC CTA passed");

    const report = await getJson<{ candidates: unknown[]; executionEvents: unknown[]; verification: { ok: boolean } }>(
      baseUrl,
      "/api/cycles/server-cycle/report"
    );
    expect(report.candidates).toHaveLength(2);
    expect(report.executionEvents).toHaveLength(1);
    expect(report.verification.ok).toBe(true);

    const verification = await getJson<{ ok: boolean; checkedEvents: number }>(
      baseUrl,
      "/api/cycles/server-cycle/verify"
    );
    expect(verification).toMatchObject({ ok: true, checkedEvents: 5 });

    const diff = await getJson<{ changedKeys: string[] }>(
      baseUrl,
      `/api/diff?left=${started.eventId}&right=${cta.eventId}`
    );
    expect(diff.changedKeys).toEqual(["confidence", "decision", "equity", "score"]);

    const noteResponse = await fetch(`${baseUrl}/api/cycles/server-cycle/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: "adon", body: "reviewed", tags: ["postmortem"] })
    });
    expect(noteResponse.status).toBe(201);
    const note = (await noteResponse.json()) as { body: string; tags: string[] };
    expect(note).toMatchObject({ body: "reviewed", tags: ["postmortem"] });
  });

  it("serves paged and filtered cycles/events while preserving legacy array responses", async () => {
    const dataDir = await tempAuditDir();
    const store = new AuditStore({ dataDir });
    appendCompletedCycle(store, "scale-btc", "BTC/USDT:USDT", [
      { phase: "analysis", type: "analysis.noted", summary: "BTC analysis one" },
      { phase: "risk", type: "risk.sized", summary: "BTC risk" }
    ]);
    appendCompletedCycle(store, "scale-eth", "ETH/USDT:USDT", [
      { phase: "analysis", type: "analysis.noted", summary: "ETH analysis one" },
      { phase: "analysis", type: "analysis.noted", summary: "ETH analysis two" },
      { phase: "execution", type: "execution.planned", summary: "ETH execution" }
    ]);
    appendCompletedCycle(store, "scale-sol", "SOL/USDT:USDT", [
      { phase: "candidate", type: "candidate.ranked", summary: "SOL candidate" }
    ]);
    store.close();

    server = createAuditServer({ dataDir });
    const baseUrl = await listen(server);

    const legacyCycles = await getJson<Array<{ cycleId: string }>>(baseUrl, "/api/cycles");
    expect(Array.isArray(legacyCycles)).toBe(true);
    expect(legacyCycles).toHaveLength(3);

    const cyclePage = await getJson<{
      items: Array<{ cycleId: string }>;
      nextCursor?: string;
      total: number;
    }>(baseUrl, "/api/cycles?limit=2");
    expect(cyclePage.items).toHaveLength(2);
    expect(cyclePage.total).toBe(3);
    expect(cyclePage.nextCursor).toBeTruthy();

    const filteredCycles = await getJson<{ items: Array<{ cycleId: string }>; total: number }>(
      baseUrl,
      "/api/cycles?q=ETH&status=completed"
    );
    expect(filteredCycles.items.map((cycle) => cycle.cycleId)).toEqual(["scale-eth"]);
    expect(filteredCycles.total).toBe(1);

    const legacyEvents = await getJson<Array<{ phase: string }>>(baseUrl, "/api/cycles/scale-eth/events");
    expect(Array.isArray(legacyEvents)).toBe(true);
    expect(legacyEvents).toHaveLength(5);

    const analysisPage = await getJson<{
      items: Array<{ phase: string; summary: string }>;
      nextCursor?: string;
      total: number;
    }>(baseUrl, "/api/cycles/scale-eth/events?phase=analysis&limit=1");
    expect(analysisPage.items).toHaveLength(1);
    expect(analysisPage.items[0]).toMatchObject({ phase: "analysis", summary: "ETH analysis one" });
    expect(analysisPage.total).toBe(2);
    expect(analysisPage.nextCursor).toBeTruthy();

    const overview = await getJson<{
      cycle: { cycleId: string };
      phaseCounts: Record<string, number>;
      gaps: string[];
    }>(baseUrl, "/api/cycles/scale-eth/overview");
    expect(overview.cycle.cycleId).toBe("scale-eth");
    expect(overview.phaseCounts.analysis).toBe(2);
    expect(overview.gaps).toContain("缺少组合层面的决策记录");
  });
});
