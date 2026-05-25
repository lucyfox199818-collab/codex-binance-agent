import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AuditStore } from "../src/core/store.js";

async function tempAuditDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "audit-cli-"));
}

async function runNode(args: string[], options: { dataDir: string; input?: string; env?: Record<string, string> }): Promise<string> {
  const result = await runNodeRaw(args, options);
  if (result.code !== 0) {
    throw new Error(`Command failed (${result.code}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function runNodeRaw(
  args: string[],
  options: { dataDir: string; input?: string; env?: Record<string, string> }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn("node", args, {
    cwd: path.resolve("."),
    env: { ...process.env, ...options.env, AUDIT_DATA_DIR: options.dataDir },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  if (options.input) {
    child.stdin.write(options.input);
  }
  child.stdin.end();
  const code = await new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
  return { code, stdout: stdout.trim(), stderr };
}

describe("audit CLI", () => {
  it("appends one event from JSON stdin", async () => {
    const dataDir = await tempAuditDir();

    const stdout = await runNode(["--import", "tsx", "src/cli/audit-cli.ts", "append"], {
      dataDir,
      input: JSON.stringify({
          cycleId: "cli-cycle",
          type: "cycle.started",
          phase: "cycle",
          summary: "started from cli",
          payload: { secret: "hidden", equity: 10 }
        })
    });

    const response = JSON.parse(stdout) as { eventId: string; payloadHash: string };
    expect(response.eventId).toBeTruthy();
    expect(response.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const store = new AuditStore({ dataDir });
    const events = store.listEvents("cli-cycle");
    expect(events).toHaveLength(1);
    expect(store.getPayload(events[0]!.eventId)).toEqual({ secret: "[REDACTED]", equity: 10 });
    store.close();
  });

  it("creates a complete sample cycle for UI and replay testing", async () => {
    const dataDir = await tempAuditDir();

    await runNode(["--import", "tsx", "src/cli/record-sample.ts"], { dataDir });

    const store = new AuditStore({ dataDir });
    const cycles = store.listCycles();
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.status).toBe("completed");
    expect(cycles[0]!.hasExecution).toBe(true);

    const events = store.listEvents(cycles[0]!.cycleId);
    expect(events.map((event) => event.type)).toEqual([
      "cycle.started",
      "mcp.call",
      "market.snapshot",
      "candidate.ranked",
      "cta.decided",
      "risk.sized",
      "execution.planned",
      "order.dry_run",
      "post.verify",
      "summary.finalized"
    ]);
    expect(store.verifyCycle(cycles[0]!.cycleId).ok).toBe(true);

    const jsonlPath = path.join(dataDir, "events", `${events[0]!.timestamp.slice(0, 10)}.jsonl`);
    const jsonl = await readFile(jsonlPath, "utf8");
    expect(jsonl.split("\n").filter(Boolean)).toHaveLength(10);
    store.close();
  });

  it("creates a configurable large local sample for UI scale testing", async () => {
    const dataDir = await tempAuditDir();

    await runNode(["--import", "tsx", "src/cli/record-large-sample.ts"], {
      dataDir,
      env: {
        AUDIT_LARGE_CYCLES: "4",
        AUDIT_LARGE_EVENTS: "12"
      }
    });

    const store = new AuditStore({ dataDir });
    const cycles = store.listCycles();
    expect(cycles).toHaveLength(4);
    expect(cycles.every((cycle) => cycle.status === "completed")).toBe(true);
    expect(cycles.every((cycle) => cycle.eventCount >= 12)).toBe(true);
    expect(cycles.some((cycle) => cycle.symbols.includes("BTC/USDT:USDT"))).toBe(true);
    expect(store.verifyCycle(cycles[0]!.cycleId).ok).toBe(true);
    store.close();
  });

  it("manages cooldowns through the CLI: set, check, list, clear", async () => {
    const dataDir = await tempAuditDir();

    const setResult = await runNode(
      ["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "set"],
      {
        dataDir,
        input: JSON.stringify({
          symbol: "HYPE/USDT:USDT",
          side: "long",
          reason: "stop",
          durationSeconds: 120,
          cycleId: "v2-cli-cooldown-1",
          notes: "stopped at 58.56"
        })
      }
    );
    const entry = JSON.parse(setResult) as { cooldownId: string; symbol: string; untilTs: string };
    expect(entry.symbol).toBe("HYPE/USDT:USDT");
    expect(entry.cooldownId).toBeTruthy();

    const checkBlocked = await runNodeRaw(
      ["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "check", "HYPE/USDT:USDT", "long"],
      { dataDir }
    );
    expect(checkBlocked.code).toBe(2);
    const blockedDecision = JSON.parse(checkBlocked.stdout) as {
      blocked: boolean;
      remainingSeconds?: number;
    };
    expect(blockedDecision.blocked).toBe(true);
    expect(blockedDecision.remainingSeconds).toBeGreaterThan(0);

    const checkAllowed = await runNode(
      ["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "check", "HYPE/USDT:USDT", "short"],
      { dataDir }
    );
    expect(JSON.parse(checkAllowed)).toMatchObject({ blocked: false });

    const list = await runNode(
      ["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "list"],
      { dataDir }
    );
    const active = JSON.parse(list) as Array<{ symbol: string }>;
    expect(active).toHaveLength(1);
    expect(active[0]!.symbol).toBe("HYPE/USDT:USDT");

    const cleared = await runNode(
      [
        "--import",
        "tsx",
        "src/cli/audit-cli.ts",
        "cooldowns",
        "clear",
        "HYPE/USDT:USDT",
        "long",
        "--cycle-id",
        "v2-cli-clear-1",
        "--notes",
        "manual clear after a new closed 15m/1h structure"
      ],
      { dataDir }
    );
    expect(JSON.parse(cleared)).toMatchObject({
      cleared: 1,
      clearCycleId: "v2-cli-clear-1",
      clearNotes: "manual clear after a new closed 15m/1h structure"
    });

    const checkAfterClear = await runNode(
      ["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "check", "HYPE/USDT:USDT", "long"],
      { dataDir }
    );
    expect(JSON.parse(checkAfterClear)).toMatchObject({ blocked: false });

    const all = await runNode(["--import", "tsx", "src/cli/audit-cli.ts", "cooldowns", "all"], { dataDir });
    const entries = JSON.parse(all) as Array<{
      symbol: string;
      clearReason?: string;
      clearCycleId?: string;
      clearNotes?: string;
    }>;
    expect(entries[0]).toMatchObject({
      symbol: "HYPE/USDT:USDT",
      clearReason: "manual_clear",
      clearCycleId: "v2-cli-clear-1",
      clearNotes: "manual clear after a new closed 15m/1h structure"
    });
  });
});
