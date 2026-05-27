import type { AuditCycleRecord, AuditEventRecord } from "../shared/types.js";
import { AuditStore } from "../core/store.js";

type JsonRecord = Record<string, unknown>;

export interface AuditAnalysisOptions {
  dataDir: string;
}

export interface AnalyzeCyclesArgs {
  limit?: number;
  status?: AuditCycleRecord["status"];
  symbol?: string;
}

export interface AnalyzeTradingArgs {
  limit?: number;
  symbol?: string;
}

export interface CycleDigestArgs {
  cycleId: string;
  includeFinalSummaryPayload?: boolean;
}

function clampLimit(value: unknown, fallback: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(max, Math.floor(value)))
    : fallback;
}

function countBy<T>(items: T[], keyOf: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function topCounts(counts: Record<string, number>, limit = 20): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function recordOrUndefined(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function stringFromPayload(payload: unknown, keys: string[]): string | undefined {
  const record = recordOrUndefined(payload);
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function eventMatchesSymbol(event: AuditEventRecord, symbol?: string): boolean {
  return !symbol || event.symbol === symbol || event.summary.includes(symbol);
}

function listRecentCycles(store: AuditStore, args: AnalyzeCyclesArgs): AuditCycleRecord[] {
  const limit = clampLimit(args.limit, 100, 500);
  return store
    .listCycles()
    .filter((cycle) => !args.status || cycle.status === args.status)
    .filter((cycle) => !args.symbol || cycle.symbols.includes(args.symbol))
    .slice(0, limit);
}

export function analyzeCycles(options: AuditAnalysisOptions, args: AnalyzeCyclesArgs = {}): JsonRecord {
  const store = new AuditStore({ dataDir: options.dataDir });
  try {
    const cycles = listRecentCycles(store, args);
    const allEvents = cycles.flatMap((cycle) => store.listEvents(cycle.cycleId));
    const phaseCounts = countBy(allEvents, (event) => event.phase);
    const typeCounts = countBy(allEvents, (event) => event.type);
    const symbolCounts = countBy(cycles.flatMap((cycle) => cycle.symbols), (symbol) => symbol);
    const completedCycles = cycles.filter((cycle) => cycle.status === "completed").length;
    const executionCycles = cycles.filter((cycle) => cycle.hasExecution).length;

    return {
      dataDir: options.dataDir,
      scope: {
        limit: clampLimit(args.limit, 100, 500),
        status: args.status,
        symbol: args.symbol
      },
      cycles: {
        analyzed: cycles.length,
        completed: completedCycles,
        running: cycles.filter((cycle) => cycle.status === "running").length,
        error: cycles.filter((cycle) => cycle.status === "error").length,
        withExecution: executionCycles,
        executionRate: cycles.length ? executionCycles / cycles.length : 0
      },
      events: {
        analyzed: allEvents.length,
        topPhases: topCounts(phaseCounts),
        topTypes: topCounts(typeCounts)
      },
      symbols: topCounts(symbolCounts),
      recentCycles: cycles.slice(0, 20).map((cycle) => ({
        cycleId: cycle.cycleId,
        startedAt: cycle.startedAt,
        status: cycle.status,
        eventCount: cycle.eventCount,
        symbols: cycle.symbols,
        hasExecution: cycle.hasExecution,
        summary: cycle.summary
      }))
    };
  } finally {
    store.close();
  }
}

export function analyzeTradingDecisions(options: AuditAnalysisOptions, args: AnalyzeTradingArgs = {}): JsonRecord {
  const store = new AuditStore({ dataDir: options.dataDir });
  try {
    const cycles = listRecentCycles(store, { limit: args.limit, symbol: args.symbol });
    const events = cycles
      .flatMap((cycle) => store.listEvents(cycle.cycleId))
      .filter((event) => eventMatchesSymbol(event, args.symbol));
    const decisionEvents = events.filter((event) =>
      ["cta.decided", "risk.sized", "execution.skipped", "execution.planned", "order.submitted", "summary.finalized"].includes(event.type)
    );

    const ctaCounts: Record<string, number> = {};
    const riskGateCounts: Record<string, number> = {};
    const skipReasonCounts: Record<string, number> = {};
    const executionTypes = countBy(events.filter((event) => event.phase === "execution" || event.phase === "action"), (event) => event.type);

    for (const event of decisionEvents) {
      let payload: unknown;
      try {
        payload = store.getPayload(event.eventId);
      } catch {
        continue;
      }
      if (event.type === "cta.decided") {
        const key = stringFromPayload(payload, ["cta", "decision", "gate_result", "no_trade_reason", "reason"]) ?? event.summary;
        ctaCounts[key] = (ctaCounts[key] ?? 0) + 1;
      } else if (event.type === "risk.sized") {
        const key = stringFromPayload(payload, ["gate_result", "economic_r_check", "reason"]) ?? event.summary;
        riskGateCounts[key] = (riskGateCounts[key] ?? 0) + 1;
      } else if (event.type === "execution.skipped") {
        const key = stringFromPayload(payload, ["reason"]) ?? event.summary;
        skipReasonCounts[key] = (skipReasonCounts[key] ?? 0) + 1;
      }
    }

    return {
      dataDir: options.dataDir,
      scope: {
        cycles: cycles.length,
        limit: clampLimit(args.limit, 200, 500),
        symbol: args.symbol
      },
      events: {
        analyzed: events.length,
        decisionEvents: decisionEvents.length
      },
      ctaDecisions: topCounts(ctaCounts),
      riskGates: topCounts(riskGateCounts),
      executionSkips: topCounts(skipReasonCounts),
      executionEvents: topCounts(executionTypes),
      recentDecisionEvents: decisionEvents.slice(-30).reverse().map((event) => ({
        cycleId: event.cycleId,
        timestamp: event.timestamp,
        type: event.type,
        phase: event.phase,
        symbol: event.symbol,
        summary: event.summary,
        payloadHash: event.payloadHash
      }))
    };
  } finally {
    store.close();
  }
}

export function getCycleDigest(options: AuditAnalysisOptions, args: CycleDigestArgs): JsonRecord {
  const store = new AuditStore({ dataDir: options.dataDir });
  try {
    const overview = store.getCycleOverview(args.cycleId);
    const report = store.getCycleReport(args.cycleId);
    const finalSummary = [...report.summaryEvents].reverse().find((event) => event.type === "summary.finalized");
    return {
      dataDir: options.dataDir,
      overview,
      counts: {
        strategy: report.strategyEvents.length,
        data: report.dataEvents.length,
        analysis: report.analysisEvents.length,
        candidates: report.candidates.length,
        decisions: report.decisionEvents.length,
        risk: report.riskEvents.length,
        execution: report.executionEvents.length,
        verification: report.verificationEvents.length,
        summary: report.summaryEvents.length
      },
      finalSummaryEvent: finalSummary,
      finalSummaryPayload:
        args.includeFinalSummaryPayload && finalSummary ? store.getPayload(finalSummary.eventId) : undefined
    };
  } finally {
    store.close();
  }
}
