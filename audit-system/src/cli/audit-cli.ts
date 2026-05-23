import type { AuditEventInput } from "../shared/types.js";
import { AuditStore } from "../core/store.js";
import { auditDataDir, readStdin } from "./env.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const store = new AuditStore({ dataDir: auditDataDir() });
  try {
    if (command === "append") {
      const raw = await readStdin();
      const input = JSON.parse(raw) as AuditEventInput;
      const event = store.appendEvent(input);
      console.log(JSON.stringify(event));
      return;
    }

    if (command === "verify") {
      const cycleId = process.argv[3];
      if (!cycleId) {
        throw new Error("Usage: audit verify <cycle_id>");
      }
      console.log(JSON.stringify(store.verifyCycle(cycleId)));
      return;
    }

    if (command === "cycles") {
      console.log(JSON.stringify(store.listCycles()));
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    store.close();
  }
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  audit append < event.json",
      "  audit verify <cycle_id>",
      "  audit cycles",
      "",
      "Environment:",
      "  AUDIT_DATA_DIR  Defaults to ../state/audit from audit-system cwd."
    ].join("\n")
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
