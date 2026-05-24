import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  AuditCycleRecord,
  AuditEventInput,
  AuditEventRecord,
  ChainVerification,
  CycleReport,
  ReviewNote,
  SymbolDecision
} from "../shared/types.js";
import { hashPayload, sha256 } from "./hash.js";
import { parseJsonArray, stableStringify } from "./json.js";
import { redactSecrets } from "./redact.js";

interface AuditStoreOptions {
  dataDir: string;
}

interface EventRow {
  event_id: string;
  cycle_id: string;
  sequence: number;
  timestamp: string;
  type: AuditEventRecord["type"];
  phase: AuditEventRecord["phase"];
  summary: string;
  severity: AuditEventRecord["severity"];
  symbol: string | null;
  parent_event_id: string | null;
  tags_json: string;
  payload_hash: string;
  payload_ref: string;
  previous_hash: string | null;
  event_hash: string;
}

interface CycleRow {
  cycle_id: string;
  started_at: string;
  ended_at: string | null;
  status: AuditCycleRecord["status"];
  event_count: number;
  first_event_hash: string | null;
  last_event_hash: string | null;
  symbols_json: string;
  has_execution: 0 | 1;
  summary: string | null;
}

interface NoteRow {
  note_id: string;
  cycle_id: string;
  timestamp: string;
  author: string;
  body: string;
  tags_json: string;
}

export class AuditStore {
  readonly dataDir: string;
  readonly dbPath: string;
  private readonly eventsDir: string;
  private readonly blobsDir: string;
  private readonly db: DatabaseSync;

  constructor(options: AuditStoreOptions) {
    this.dataDir = options.dataDir;
    this.dbPath = path.join(this.dataDir, "trading-audit.sqlite");
    this.eventsDir = path.join(this.dataDir, "events");
    this.blobsDir = path.join(this.dataDir, "blobs");
    mkdirSync(this.eventsDir, { recursive: true });
    mkdirSync(this.blobsDir, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureSchema();
  }

  appendEvent(input: AuditEventInput): AuditEventRecord {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const payload = redactSecrets(input.payload ?? {});
    const payloadHash = hashPayload(payload);
    const payloadRef = this.writePayloadBlob(payloadHash, payload);
    const previous = this.getLastEvent(input.cycleId);
    const sequence = previous ? previous.sequence + 1 : 1;
    const eventId = randomUUID();
    const baseRecord: Omit<AuditEventRecord, "eventHash"> = {
      eventId,
      cycleId: input.cycleId,
      sequence,
      timestamp,
      type: input.type,
      phase: input.phase,
      summary: input.summary,
      severity: input.severity ?? "info",
      symbol: input.symbol,
      parentEventId: input.parentEventId,
      tags: input.tags ?? [],
      payloadHash,
      payloadRef,
      previousHash: previous?.eventHash
    };
    const eventHash = computeEventHash(baseRecord);
    const record: AuditEventRecord = { ...baseRecord, eventHash };

    this.insertEvent(record);
    this.appendJsonl(record);
    this.upsertCycle(record);
    return record;
  }

  listCycles(): AuditCycleRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM cycles ORDER BY started_at DESC")
      .all() as CycleRow[];
    return rows.map(cycleFromRow);
  }

  getCycle(cycleId: string): AuditCycleRecord | undefined {
    const row = this.db.prepare("SELECT * FROM cycles WHERE cycle_id = ?").get(cycleId) as
      | CycleRow
      | undefined;
    return row ? cycleFromRow(row) : undefined;
  }

  listEvents(cycleId: string): AuditEventRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE cycle_id = ? ORDER BY sequence ASC")
      .all(cycleId) as EventRow[];
    return rows.map(eventFromRow);
  }

  getEvent(eventId: string): AuditEventRecord | undefined {
    const row = this.db.prepare("SELECT * FROM events WHERE event_id = ?").get(eventId) as
      | EventRow
      | undefined;
    return row ? eventFromRow(row) : undefined;
  }

  getPayload(eventId: string): unknown {
    const event = this.getEvent(eventId);
    if (!event) {
      throw new Error(`Unknown audit event: ${eventId}`);
    }
    const blobPath = path.join(this.dataDir, event.payloadRef);
    return JSON.parse(gunzipSync(readFileSync(blobPath)).toString("utf8")) as unknown;
  }

  addReviewNote(cycleId: string, body: string, options: { author?: string; tags?: string[] } = {}): ReviewNote {
    if (!this.getCycle(cycleId)) {
      throw new Error(`Unknown audit cycle: ${cycleId}`);
    }
    const note: ReviewNote = {
      noteId: randomUUID(),
      cycleId,
      timestamp: new Date().toISOString(),
      author: options.author ?? "local",
      body,
      tags: options.tags ?? []
    };
    this.db
      .prepare(
        `INSERT INTO review_notes (note_id, cycle_id, timestamp, author, body, tags_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(note.noteId, note.cycleId, note.timestamp, note.author, note.body, JSON.stringify(note.tags));
    this.appendEvent({
      cycleId,
      type: "review.note",
      phase: "review",
      summary: `Review note by ${note.author}`,
      payload: note,
      tags: note.tags
    });
    return note;
  }

  listReviewNotes(cycleId: string): ReviewNote[] {
    const rows = this.db
      .prepare("SELECT * FROM review_notes WHERE cycle_id = ? ORDER BY timestamp ASC")
      .all(cycleId) as NoteRow[];
    return rows.map(noteFromRow);
  }

  listSymbolDecisions(symbol: string): SymbolDecision[] {
    const rows = this.db
      .prepare(
        `SELECT cycle_id, timestamp, symbol, type, phase, summary, payload_hash
         FROM events
         WHERE symbol = ? OR payload_hash IN (
           SELECT payload_hash FROM events WHERE symbol = ?
         )
         ORDER BY timestamp DESC`
      )
      .all(symbol, symbol) as Array<{
      cycle_id: string;
      timestamp: string;
      symbol: string | null;
      type: AuditEventRecord["type"];
      phase: AuditEventRecord["phase"];
      summary: string;
      payload_hash: string;
    }>;
    return rows
      .filter((row) => row.symbol === symbol)
      .map((row) => ({
        cycleId: row.cycle_id,
        timestamp: row.timestamp,
        symbol,
        type: row.type,
        phase: row.phase,
        summary: row.summary,
        payloadHash: row.payload_hash
      }));
  }

  getCycleReport(cycleId: string): CycleReport {
    const cycle = this.getCycle(cycleId);
    if (!cycle) {
      throw new Error(`Unknown audit cycle: ${cycleId}`);
    }
    const events = this.listEvents(cycleId);
    return {
      cycle,
      events,
      strategyEvents: events.filter((event) => phaseMatches(event.phase, ["strategy"])),
      dataEvents: events.filter((event) => phaseMatches(event.phase, ["preflight", "data", "market"])),
      analysisEvents: events.filter((event) => phaseMatches(event.phase, ["analysis"])),
      screeningEvents: events.filter((event) => isScreeningEvent(event)),
      decisionEvents: events.filter((event) => phaseMatches(event.phase, ["decision", "intent", "cta"])),
      portfolioEvents: events.filter((event) => isPortfolioEvent(event)),
      riskEvents: events.filter((event) => phaseMatches(event.phase, ["risk"])),
      actionEvents: events.filter((event) => phaseMatches(event.phase, ["action"])),
      verificationEvents: events.filter((event) => phaseMatches(event.phase, ["verification"])),
      summaryEvents: events.filter((event) => phaseMatches(event.phase, ["summary"]) || event.type === "summary.finalized"),
      candidates: events.filter((event) => event.phase === "candidate" || event.phase === "cta"),
      executionEvents: events.filter(
        (event) => event.phase === "action" || event.phase === "execution" || event.phase === "verification"
      ),
      verification: this.verifyCycle(cycleId),
      notes: this.listReviewNotes(cycleId)
    };
  }

  diffPayloads(leftEventId: string, rightEventId: string): { left: unknown; right: unknown; changedKeys: string[] } {
    const left = this.getPayload(leftEventId);
    const right = this.getPayload(rightEventId);
    return {
      left,
      right,
      changedKeys: diffTopLevelKeys(left, right)
    };
  }

  verifyCycle(cycleId: string): ChainVerification {
    const events = this.listEvents(cycleId);
    if (!events.length) {
      return { cycleId, ok: false, checkedEvents: 0, reason: "no audit events" };
    }
    let previousHash: string | undefined;
    let checkedEvents = 0;
    for (const event of events) {
      checkedEvents += 1;
      const payload = this.getPayload(event.eventId);
      if (hashPayload(payload) !== event.payloadHash) {
        return {
          cycleId,
          ok: false,
          checkedEvents,
          brokenAtEventId: event.eventId,
          reason: "payload hash mismatch"
        };
      }
      if (event.previousHash !== previousHash) {
        return {
          cycleId,
          ok: false,
          checkedEvents,
          brokenAtEventId: event.eventId,
          reason: "previous hash mismatch"
        };
      }
      const { eventHash, ...base } = event;
      const expected = computeEventHash(base);
      if (eventHash !== expected) {
        return {
          cycleId,
          ok: false,
          checkedEvents,
          brokenAtEventId: event.eventId,
          reason: "event hash mismatch"
        };
      }
      previousHash = eventHash;
    }
    const finalEvent = [...events].reverse().find((event) => event.type === "summary.finalized");
    if (!finalEvent) {
      return { cycleId, ok: false, checkedEvents, reason: "missing summary.finalized" };
    }
    if (isV3AuditCycle(cycleId, events)) {
      const missingFields = missingV3FinalSummaryFields(this.getPayload(finalEvent.eventId));
      if (missingFields.length) {
        return {
          cycleId,
          ok: false,
          checkedEvents,
          brokenAtEventId: finalEvent.eventId,
          reason: `incomplete V3 final summary: missing ${missingFields.join(", ")}`
        };
      }
    }
    return { cycleId, ok: true, checkedEvents };
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cycles (
        cycle_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        event_count INTEGER NOT NULL,
        first_event_hash TEXT,
        last_event_hash TEXT,
        symbols_json TEXT NOT NULL,
        has_execution INTEGER NOT NULL,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        cycle_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        phase TEXT NOT NULL,
        summary TEXT NOT NULL,
        severity TEXT NOT NULL,
        symbol TEXT,
        parent_event_id TEXT,
        tags_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        payload_ref TEXT NOT NULL,
        previous_hash TEXT,
        event_hash TEXT NOT NULL,
        FOREIGN KEY (cycle_id) REFERENCES cycles(cycle_id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_cycle_sequence ON events(cycle_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_events_symbol ON events(symbol);

      CREATE TABLE IF NOT EXISTS review_notes (
        note_id TEXT PRIMARY KEY,
        cycle_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        author TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        FOREIGN KEY (cycle_id) REFERENCES cycles(cycle_id)
      );
    `);
  }

  private writePayloadBlob(payloadHash: string, payload: unknown): string {
    const payloadRef = path.join("blobs", `${payloadHash}.json.gz`);
    const blobPath = path.join(this.dataDir, payloadRef);
    if (!existsSync(blobPath)) {
      writeFileSync(blobPath, gzipSync(JSON.stringify(payload, null, 2)));
    }
    return payloadRef;
  }

  private insertEvent(record: AuditEventRecord): void {
    if (!this.getCycle(record.cycleId)) {
      this.db
        .prepare(
          `INSERT INTO cycles
           (cycle_id, started_at, status, event_count, symbols_json, has_execution)
           VALUES (?, ?, 'running', 0, '[]', 0)`
        )
        .run(record.cycleId, record.timestamp);
    }
    this.db
      .prepare(
        `INSERT INTO events (
          event_id, cycle_id, sequence, timestamp, type, phase, summary, severity,
          symbol, parent_event_id, tags_json, payload_hash, payload_ref,
          previous_hash, event_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.eventId,
        record.cycleId,
        record.sequence,
        record.timestamp,
        record.type,
        record.phase,
        record.summary,
        record.severity,
        record.symbol ?? null,
        record.parentEventId ?? null,
        JSON.stringify(record.tags),
        record.payloadHash,
        record.payloadRef,
        record.previousHash ?? null,
        record.eventHash
      );
  }

  private appendJsonl(record: AuditEventRecord): void {
    const day = record.timestamp.slice(0, 10);
    appendFileSync(path.join(this.eventsDir, `${day}.jsonl`), `${JSON.stringify(record)}\n`);
  }

  private upsertCycle(record: AuditEventRecord): void {
    const current = this.getCycle(record.cycleId);
    if (!current) {
      throw new Error(`Failed to create cycle: ${record.cycleId}`);
    }
    const symbols = new Set(current.symbols);
    if (record.symbol) {
      symbols.add(record.symbol);
    }
    const isFinal = record.type === "summary.finalized";
    const hasExecution =
      current.hasExecution ||
      record.phase === "action" ||
      record.phase === "execution" ||
      record.type === "order.submitted" ||
      record.type === "order.dry_run" ||
      record.type === "action.executed";
    this.db
      .prepare(
        `UPDATE cycles
         SET ended_at = ?, status = ?, event_count = ?, first_event_hash = COALESCE(first_event_hash, ?),
             last_event_hash = ?, symbols_json = ?, has_execution = ?, summary = COALESCE(?, summary)
         WHERE cycle_id = ?`
      )
      .run(
        isFinal ? record.timestamp : current.endedAt ?? null,
        isFinal ? "completed" : current.status,
        current.eventCount + 1,
        record.eventHash,
        record.eventHash,
        JSON.stringify([...symbols].sort()),
        hasExecution ? 1 : 0,
        isFinal ? record.summary : null,
        record.cycleId
      );
  }

  private getLastEvent(cycleId: string): AuditEventRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM events WHERE cycle_id = ? ORDER BY sequence DESC LIMIT 1")
      .get(cycleId) as EventRow | undefined;
    return row ? eventFromRow(row) : undefined;
  }
}

function eventFromRow(row: EventRow): AuditEventRecord {
  return {
    eventId: row.event_id,
    cycleId: row.cycle_id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    type: row.type,
    phase: row.phase,
    summary: row.summary,
    severity: row.severity,
    symbol: row.symbol ?? undefined,
    parentEventId: row.parent_event_id ?? undefined,
    tags: parseJsonArray(row.tags_json),
    payloadHash: row.payload_hash,
    payloadRef: row.payload_ref,
    previousHash: row.previous_hash ?? undefined,
    eventHash: row.event_hash
  };
}

function cycleFromRow(row: CycleRow): AuditCycleRecord {
  return {
    cycleId: row.cycle_id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    eventCount: row.event_count,
    firstEventHash: row.first_event_hash ?? undefined,
    lastEventHash: row.last_event_hash ?? undefined,
    symbols: parseJsonArray(row.symbols_json),
    hasExecution: row.has_execution === 1,
    summary: row.summary ?? undefined
  };
}

function noteFromRow(row: NoteRow): ReviewNote {
  return {
    noteId: row.note_id,
    cycleId: row.cycle_id,
    timestamp: row.timestamp,
    author: row.author,
    body: row.body,
    tags: parseJsonArray(row.tags_json)
  };
}

function computeEventHash(record: Omit<AuditEventRecord, "eventHash">): string {
  return sha256(stableStringify(record));
}

function diffTopLevelKeys(left: unknown, right: unknown): string[] {
  const leftRecord = objectRecord(left);
  const rightRecord = objectRecord(right);
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].filter((key) => stableStringify(leftRecord[key]) !== stableStringify(rightRecord[key])).sort();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

function phaseMatches(phase: string, candidates: string[]): boolean {
  return candidates.includes(phase);
}

function isScreeningEvent(event: AuditEventRecord): boolean {
  if (phaseMatches(event.phase, ["summary", "review", "verification"])) {
    return false;
  }
  const type = event.type.toLowerCase();
  const summary = event.summary.toLowerCase();
  return (
    phaseMatches(event.phase, ["market", "analysis", "candidate"]) ||
    type.includes("screen") ||
    type.includes("scan") ||
    type.includes("opportunity") ||
    type.includes("analysis") ||
    summary.includes("scan") ||
    summary.includes("selected") ||
    summary.includes("screen")
  );
}

function isPortfolioEvent(event: AuditEventRecord): boolean {
  if (phaseMatches(event.phase, ["summary", "review", "verification"])) {
    return false;
  }
  const type = event.type.toLowerCase();
  const summary = event.summary.toLowerCase();
  return (
    phaseMatches(event.phase, ["decision", "intent", "risk"]) ||
    type.includes("portfolio") ||
    type.includes("intent") ||
    type.includes("decision") ||
    summary.includes("portfolio") ||
    summary.includes("decision")
  );
}

function isV3AuditCycle(cycleId: string, events: AuditEventRecord[]): boolean {
  const normalizedCycleId = cycleId.toLowerCase();
  return (
    normalizedCycleId.startsWith("v3") ||
    events.some(
      (event) =>
        event.tags.some((tag) => tag.toLowerCase() === "v3") ||
        event.type.toLowerCase().includes("v3") ||
        event.summary.toLowerCase().includes("v3")
    )
  );
}

function missingV3FinalSummaryFields(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return ["structured summary payload"];
  }
  const missing: string[] = [];
  if (!hasAnyKey(payload, ["strategyFile", "strategyPath"])) {
    missing.push("strategyFile");
  }
  if (!hasAnyKey(payload, ["config", "exchange"])) {
    missing.push("config/exchange");
  }
  if (!hasAnyKey(payload, ["accountSummary"])) {
    missing.push("accountSummary");
  }
  if (!hasAnyKey(payload, ["portfolioDecision", "decision", "portfolioSummary"])) {
    missing.push("portfolioDecision");
  }
  if (!hasAnyKey(payload, ["actions", "actionSummary", "executionResult", "executionResults"])) {
    missing.push("actions/actionSummary");
  }
  if (!hasAnyKey(payload, ["nextRoundFocus", "nextFocus"])) {
    missing.push("nextRoundFocus");
  }
  return missing;
}

function hasAnyKey(record: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = record[key];
    if (Array.isArray(value)) {
      return true;
    }
    if (isRecord(value)) {
      return Object.keys(value).length > 0;
    }
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
