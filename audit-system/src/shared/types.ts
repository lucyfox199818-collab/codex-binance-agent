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
}

export interface CycleReport {
  cycle: AuditCycleRecord;
  events: AuditEventRecord[];
  strategyEvents: AuditEventRecord[];
  dataEvents: AuditEventRecord[];
  analysisEvents: AuditEventRecord[];
  decisionEvents: AuditEventRecord[];
  riskEvents: AuditEventRecord[];
  actionEvents: AuditEventRecord[];
  verificationEvents: AuditEventRecord[];
  candidates: AuditEventRecord[];
  executionEvents: AuditEventRecord[];
  verification: ChainVerification;
  notes: ReviewNote[];
}
