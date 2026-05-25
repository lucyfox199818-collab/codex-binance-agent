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
      const verification = store.verifyCycle(cycleId);
      console.log(JSON.stringify(verification));
      if (!verification.ok) {
        process.exitCode = 1;
      }
      return;
    }

    if (command === "cycles") {
      console.log(JSON.stringify(store.listCycles()));
      return;
    }

    if (command === "repair-execution-flags") {
      const cycleId = process.argv[3];
      console.log(JSON.stringify(store.repairExecutionFlags(cycleId)));
      return;
    }

    if (command === "cooldowns") {
      const subcommand = process.argv[3];
      if (!subcommand || subcommand === "list") {
        const symbol = process.argv[4];
        console.log(JSON.stringify(store.listActiveCooldowns(symbol)));
        return;
      }
      if (subcommand === "all") {
        console.log(JSON.stringify(store.listAllCooldowns()));
        return;
      }
      if (subcommand === "check") {
        const symbol = process.argv[4];
        const side = process.argv[5];
        if (!symbol || (side !== "long" && side !== "short")) {
          throw new Error("Usage: audit cooldowns check <symbol> <long|short>");
        }
        const decision = store.checkCooldown(symbol, side);
        console.log(JSON.stringify(decision));
        if (decision.blocked) {
          process.exitCode = 2;
        }
        return;
      }
      if (subcommand === "set") {
        const raw = await readStdin();
        const input = JSON.parse(raw) as {
          symbol: string;
          side: "long" | "short" | "both";
          reason: "stop" | "abort" | "manual_close" | "external";
          durationSeconds?: number;
          cycleId?: string;
          notes?: string;
        };
        const entry = store.setCooldown(input);
        console.log(JSON.stringify(entry));
        return;
      }
      if (subcommand === "clear") {
        const symbol = process.argv[4];
        const side = process.argv[5];
        if (!symbol) {
          throw new Error("Usage: audit cooldowns clear <symbol> [long|short|both] [--reason reason] [--cycle-id cycle] [--notes text]");
        }
        const sideArg = side === "long" || side === "short" || side === "both" ? side : undefined;
        const optionStart = sideArg ? 6 : 5;
        const clearOptions = parseClearOptions(process.argv.slice(optionStart));
        const cleared = store.clearCooldown(symbol, sideArg, clearOptions);
        console.log(
          JSON.stringify({
            cleared,
            clearReason: clearOptions.reason ?? "manual_clear",
            clearCycleId: clearOptions.cycleId,
            clearNotes: clearOptions.notes
          })
        );
        return;
      }
      throw new Error(`Unknown cooldowns subcommand: ${subcommand}`);
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
      "  audit repair-execution-flags [cycle_id]",
      "  audit cooldowns list [symbol]",
      "  audit cooldowns all",
      "  audit cooldowns check <symbol> <long|short>",
      "  audit cooldowns set < cooldown.json",
      "  audit cooldowns clear <symbol> [long|short|both] [--reason reason] [--cycle-id cycle] [--notes text]",
      "",
      "Environment:",
      "  AUDIT_DATA_DIR  Defaults to ../state/audit from audit-system cwd."
    ].join("\n")
  );
}

function parseClearOptions(args: string[]): { reason?: string; cycleId?: string; notes?: string } {
  const options: { reason?: string; cycleId?: string; notes?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--reason") {
      options.reason = requireOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--cycle-id") {
      options.cycleId = requireOptionValue(args, index, arg);
      index += 1;
    } else if (arg === "--notes") {
      options.notes = requireOptionValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown cooldowns clear option: ${arg}`);
    }
  }
  return options;
}

function requireOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
