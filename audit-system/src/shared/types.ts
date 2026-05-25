export type KnownAuditEventType =
  | "cycle.started"
  | "strategy.loaded"
  | "mcp.call"
  | "market.snapshot"
  | "analysis.noted"
  | "candidate.ranked"
  | "candidate.filtered"
  | "intent.decided"
  | "cta.decided"
  | "risk.sized"
  | "action.planned"
  | "action.executed"
  | "action.remediated"
  | "execution.planned"
  | "order.submitted"
  | "order.dry_run"
  | "post.verify"
  | "summary.finalized"
  | "review.note";

export type AuditEventType = KnownAuditEventType | (string & {});

export type KnownAuditPhase =
  | "cycle"
  | "strategy"
  | "data"
  | "preflight"
  | "market"
  | "analysis"
  | "candidate"
  | "decision"
  | "intent"
  | "cta"
  | "risk"
  | "action"
  | "execution"
  | "verification"
  | "summary"
  | "review";

export type AuditPhase = KnownAuditPhase | (string & {});

export type AuditSeverity = "debug" | "info" | "warn" | "error";

export interface AuditEventInput {
  cycleId: string;
  type: AuditEventType;
  phase: AuditPhase;
  summary: string;
  payload?: unknown;
  severity?: AuditSeverity;
  symbol?: string;
  parentEventId?: string;
  tags?: string[];
  timestamp?: string;
}

export interface AuditEventRecord {
  eventId: string;
  cycleId: string;
  sequence: number;
  timestamp: string;
  type: AuditEventType;
  phase: AuditPhase;
  summary: string;
  severity: AuditSeverity;
  symbol?: string;
  parentEventId?: string;
  tags: string[];
  payloadHash: string;
  payloadRef: string;
  previousHash?: string;
  eventHash: string;
}

export interface AuditCycleRecord {
  cycleId: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "completed" | "error";
  eventCount: number;
  firstEventHash?: string;
  lastEventHash?: string;
  symbols: string[];
  hasExecution: boolean;
  summary?: string;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor?: string;
  total: number;
}

export interface CycleQuery {
  q?: string;
  status?: AuditCycleRecord["status"];
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface EventQuery {
  q?: string;
  phases?: AuditPhase[];
  type?: string;
  symbol?: string;
  severity?: AuditSeverity;
  limit?: number;
  cursor?: string;
}

export interface ReviewNote {
  noteId: string;
  cycleId: string;
  timestamp: string;
  author: string;
  body: string;
  tags: string[];
}

export interface SymbolDecision {
  cycleId: string;
  timestamp: string;
  symbol: string;
  type: AuditEventType;
  phase: AuditPhase;
  summary: string;
  payloadHash: string;
}

export interface ChainVerification {
  cycleId: string;
  ok: boolean;
  checkedEvents: number;
  brokenAtEventId?: string;
  reason?: string;
  issues?: string[];
}

export type CooldownSide = "long" | "short" | "both";

export type CooldownReason =
  | "stop"
  | "abort"
  | "manual_close"
  | "external";

export interface CooldownEntry {
  cooldownId: string;
  symbol: string;
  side: CooldownSide;
  reason: CooldownReason;
  startedAt: string;
  untilTs: string;
  cycleId?: string;
  notes?: string;
  clearedAt?: string;
  clearReason?: string;
  clearCycleId?: string;
  clearNotes?: string;
}

export interface CooldownInput {
  symbol: string;
  side: CooldownSide;
  reason: CooldownReason;
  durationSeconds?: number;
  startedAt?: string;
  cycleId?: string;
  notes?: string;
}

export interface CooldownClearOptions {
  reason?: string;
  cycleId?: string;
  notes?: string;
}

export interface CooldownCheck {
  symbol: string;
  side: "long" | "short";
  blocked: boolean;
  remainingSeconds?: number;
  entry?: CooldownEntry;
}

export interface CycleReport {
  cycle: AuditCycleRecord;
  events: AuditEventRecord[];
  strategyEvents: AuditEventRecord[];
  dataEvents: AuditEventRecord[];
  analysisEvents: AuditEventRecord[];
  screeningEvents: AuditEventRecord[];
  decisionEvents: AuditEventRecord[];
  portfolioEvents: AuditEventRecord[];
  riskEvents: AuditEventRecord[];
  actionEvents: AuditEventRecord[];
  verificationEvents: AuditEventRecord[];
  summaryEvents: AuditEventRecord[];
  candidates: AuditEventRecord[];
  executionEvents: AuditEventRecord[];
  verification: ChainVerification;
  notes: ReviewNote[];
}

export interface CycleOverview {
  cycle: AuditCycleRecord;
  verification: ChainVerification;
  phaseCounts: Record<string, number>;
  severityCounts: Record<string, number>;
  lastEvent?: AuditEventRecord;
  finalSummarySequence?: number;
  gaps: string[];
}
