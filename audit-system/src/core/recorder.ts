import type { AuditEventInput, AuditEventRecord } from "../shared/types.js";
import { AuditStore } from "./store.js";

export class AuditRecorder {
  constructor(private readonly store: AuditStore, readonly cycleId: string) {}

  record(input: Omit<AuditEventInput, "cycleId">): AuditEventRecord {
    return this.store.appendEvent({ ...input, cycleId: this.cycleId });
  }

  start(payload: unknown = {}): AuditEventRecord {
    return this.record({
      type: "cycle.started",
      phase: "cycle",
      summary: "Cycle started",
      payload
    });
  }

  finalize(summary: string, payload: unknown = {}): AuditEventRecord {
    return this.record({
      type: "summary.finalized",
      phase: "summary",
      summary,
      payload
    });
  }
}
