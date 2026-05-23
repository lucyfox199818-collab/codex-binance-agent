import { mkdtemp, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AuditStore } from "../src/core/store.js";

async function tempAuditDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "audit-cli-"));
}

async function runNode(args: string[], options: { dataDir: string; input?: string }): Promise<string> {
  const child = spawn("node", args, {
    cwd: path.resolve("."),
    env: { ...process.env, AUDIT_DATA_DIR: options.dataDir },
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
  if (code !== 0) {
    throw new Error(`Command failed (${code}): ${stderr}`);
  }
  return stdout.trim();
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
});
