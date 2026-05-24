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
});
