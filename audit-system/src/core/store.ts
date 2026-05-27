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
  CooldownClearOptions,
  CooldownCheck,
  CooldownEntry,
  CooldownInput,
  CooldownReason,
  CooldownSide,
  CycleOverview,
  CycleQuery,
  CycleReport,
  EventQuery,
  PagedResult,
  ReviewNote,
  SymbolDecision
} from "../shared/types.js";
import { hashPayload, sha256 } from "./hash.js";
import { parseJsonArray, stableStringify } from "./json.js";
import { redactSecrets } from "./redact.js";

interface AuditStoreOptions {
  dataDir: string;
}

interface VerifyCycleOptions {
  verifyPayloads?: boolean;
  verifyV3SummaryPayload?: boolean;
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

interface CooldownRow {
  cooldown_id: string;
  symbol: string;
  side: CooldownSide;
  reason: CooldownReason;
  started_at: string;
  until_ts: string;
  cycle_id: string | null;
  notes: string | null;
  cleared_at: string | null;
  clear_reason: string | null;
  clear_cycle_id: string | null;
  clear_notes: string | null;
}

const DEFAULT_COOLDOWN_SECONDS: Record<CooldownReason, number> = {
  stop: 30 * 60,
  abort: 15 * 60,
  manual_close: 15 * 60,
  external: 30 * 60
};

const SQLITE_BUSY_TIMEOUT_MS = 10_000;
const SQLITE_WRITE_RETRIES = 4;

interface NoteRow {
  note_id: string;
  cycle_id: string;
  timestamp: string;
  author: string;
  body: string;
  tags_json: string;
}

type QueryParam = string | number | null;

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
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.ensureSchema();
  }

  appendEvent(input: AuditEventInput): AuditEventRecord {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const payload = redactSecrets(input.payload ?? {});
    const payloadHash = hashPayload(payload);
    const payloadRef = this.writePayloadBlob(payloadHash, payload);
    const eventId = randomUUID();

    const record = this.withWriteTransaction(() => {
      const previous = this.getLastEvent(input.cycleId);
      const sequence = previous ? previous.sequence + 1 : 1;
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
      this.upsertCycle(record);
      return record;
    });
    this.appendJsonl(record);
    return record;
  }

  listCycles(): AuditCycleRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM cycles ORDER BY started_at DESC")
      .all() as CycleRow[];
    return rows.map(cycleFromRow);
  }

  listCyclesPage(query: CycleQuery = {}): PagedResult<AuditCycleRecord> {
    const { where, params } = buildCycleWhere(query);
    const total = countRows(this.db, `SELECT COUNT(*) AS total FROM cycles ${where}`, params);
    const limit = clampLimit(query.limit);
    const offset = parseCursor(query.cursor);
    const rows = this.db
      .prepare(`SELECT * FROM cycles ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as CycleRow[];
    return pageRows(rows.map(cycleFromRow), total, limit, offset);
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

  listEventsPage(cycleId: string, query: EventQuery = {}): PagedResult<AuditEventRecord> {
    const { where, params } = buildEventWhere(cycleId, query);
    const total = countRows(this.db, `SELECT COUNT(*) AS total FROM events ${where}`, params);
    const limit = clampLimit(query.limit);
    const offset = parseCursor(query.cursor);
    const rows = this.db
      .prepare(`SELECT * FROM events ${where} ORDER BY sequence ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as EventRow[];
    return pageRows(rows.map(eventFromRow), total, limit, offset);
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
    this.withWriteTransaction(() => {
      this.db
        .prepare(
          `INSERT INTO review_notes (note_id, cycle_id, timestamp, author, body, tags_json)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(note.noteId, note.cycleId, note.timestamp, note.author, note.body, JSON.stringify(note.tags));
    });
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

  getCycleOverview(cycleId: string): CycleOverview {
    const cycle = this.getCycle(cycleId);
    if (!cycle) {
      throw new Error(`Unknown audit cycle: ${cycleId}`);
    }
    const events = this.listEvents(cycleId);
    const phaseCounts = countBy(events, (event) => event.phase);
    const severityCounts = countBy(events, (event) => event.severity);
    const finalSummary = [...events].reverse().find((event) => event.type === "summary.finalized");
    return {
      cycle,
      verification: this.verifyCycle(cycleId, { verifyPayloads: false, verifyV3SummaryPayload: false }),
      phaseCounts,
      severityCounts,
      lastEvent: events.at(-1),
      finalSummarySequence: finalSummary?.sequence,
      gaps: cycleGaps(cycle, events)
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

  verifyCycle(cycleId: string, options: VerifyCycleOptions = {}): ChainVerification {
    const verifyPayloads = options.verifyPayloads ?? true;
    const verifyV3SummaryPayload = options.verifyV3SummaryPayload ?? verifyPayloads;
    const events = this.listEvents(cycleId);
    if (!events.length) {
      return { cycleId, ok: false, checkedEvents: 0, reason: "no audit events" };
    }
    let previousHash: string | undefined;
    let checkedEvents = 0;
    for (const event of events) {
      checkedEvents += 1;
      if (verifyPayloads) {
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
    if (verifyV3SummaryPayload && isV3AuditCycle(cycleId, events)) {
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

  repairExecutionFlags(cycleId?: string): { checked: number; updated: number } {
    const cycles = cycleId
      ? [this.getCycle(cycleId)].filter((cycle): cycle is AuditCycleRecord => Boolean(cycle))
      : this.listCycles();
    if (cycleId && cycles.length === 0) {
      throw new Error(`Unknown audit cycle: ${cycleId}`);
    }

    const update = this.db.prepare("UPDATE cycles SET has_execution = ? WHERE cycle_id = ?");
    let checked = 0;
    let updated = 0;
    for (const cycle of cycles) {
      const hasExecution = this.listEvents(cycle.cycleId).some(isExecutionFlagEvent);
      checked += 1;
      if (cycle.hasExecution !== hasExecution) {
        update.run(hasExecution ? 1 : 0, cycle.cycleId);
        updated += 1;
      }
    }
    return { checked, updated };
  }

  setCooldown(input: CooldownInput): CooldownEntry {
    const reason = input.reason;
    if (!isCooldownReason(reason)) {
      throw new Error(`Unsupported cooldown reason: ${String(reason)}`);
    }
    const durationSeconds = input.durationSeconds ?? DEFAULT_COOLDOWN_SECONDS[reason];
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Cooldown duration must be positive");
    }
    const startedAt = input.startedAt ?? new Date().toISOString();
    const untilTs = new Date(Date.parse(startedAt) + durationSeconds * 1000).toISOString();
    const cooldownId = randomUUID();
    this.withWriteTransaction(() => {
      // Supersede any active record for the same symbol/side.
      this.db
        .prepare(
          `UPDATE cooldowns
           SET cleared_at = ?, clear_reason = COALESCE(clear_reason, ?)
           WHERE symbol = ? AND (side = ? OR side = 'both' OR ? = 'both')
             AND cleared_at IS NULL`
        )
        .run(startedAt, "superseded_by_new_entry", input.symbol, input.side, input.side);
      this.db
        .prepare(
          `INSERT INTO cooldowns
           (cooldown_id, symbol, side, reason, started_at, until_ts, cycle_id, notes, cleared_at, clear_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
        )
        .run(
          cooldownId,
          input.symbol,
          input.side,
          reason,
          startedAt,
          untilTs,
          input.cycleId ?? null,
          input.notes ?? null
        );
    });
    return {
      cooldownId,
      symbol: input.symbol,
      side: input.side,
      reason,
      startedAt,
      untilTs,
      cycleId: input.cycleId,
      notes: input.notes
    };
  }

  clearCooldown(symbol: string, side?: CooldownSide, options: CooldownClearOptions = {}): number {
    const now = new Date().toISOString();
    const sideClause = side ? "AND side = ?" : "";
    const params: QueryParam[] = [
      now,
      options.reason ?? "manual_clear",
      options.cycleId ?? null,
      options.notes ?? null,
      symbol
    ];
    if (side) {
      params.push(side);
    }
    const result = this.withWriteTransaction(() =>
      this.db
        .prepare(
          `UPDATE cooldowns
           SET cleared_at = ?, clear_reason = ?, clear_cycle_id = ?, clear_notes = ?
           WHERE symbol = ? ${sideClause} AND cleared_at IS NULL`
        )
        .run(...params)
    );
    return Number(result.changes);
  }

  listActiveCooldowns(symbol?: string): CooldownEntry[] {
    const now = new Date().toISOString();
    const params: QueryParam[] = [now];
    let sql =
      "SELECT * FROM cooldowns WHERE cleared_at IS NULL AND until_ts > ?";
    if (symbol) {
      sql += " AND symbol = ?";
      params.push(symbol);
    }
    sql += " ORDER BY until_ts ASC";
    const rows = this.db.prepare(sql).all(...params) as CooldownRow[];
    return rows.map(cooldownFromRow);
  }

  listAllCooldowns(): CooldownEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM cooldowns ORDER BY started_at DESC LIMIT 500")
      .all() as CooldownRow[];
    return rows.map(cooldownFromRow);
  }

  checkCooldown(symbol: string, side: "long" | "short"): CooldownCheck {
    const now = new Date().toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM cooldowns
         WHERE symbol = ? AND cleared_at IS NULL AND until_ts > ?
           AND (side = ? OR side = 'both')
         ORDER BY until_ts DESC LIMIT 1`
      )
      .all(symbol, now, side) as CooldownRow[];
    if (!rows.length) {
      return { symbol, side, blocked: false };
    }
    const entry = cooldownFromRow(rows[0]!);
    const remainingSeconds = Math.max(
      0,
      Math.round((Date.parse(entry.untilTs) - Date.parse(now)) / 1000)
    );
    return { symbol, side, blocked: true, remainingSeconds, entry };
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.withWriteTransaction(() => {
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
        CREATE INDEX IF NOT EXISTS idx_events_cycle_phase_sequence ON events(cycle_id, phase, sequence);
        CREATE INDEX IF NOT EXISTS idx_cycles_started_at ON cycles(started_at);
        CREATE INDEX IF NOT EXISTS idx_cycles_status_started_at ON cycles(status, started_at);

        CREATE TABLE IF NOT EXISTS review_notes (
          note_id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          author TEXT NOT NULL,
          body TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          FOREIGN KEY (cycle_id) REFERENCES cycles(cycle_id)
        );

        CREATE TABLE IF NOT EXISTS cooldowns (
          cooldown_id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL,
          reason TEXT NOT NULL,
          started_at TEXT NOT NULL,
          until_ts TEXT NOT NULL,
          cycle_id TEXT,
          notes TEXT,
          cleared_at TEXT,
          clear_reason TEXT,
          clear_cycle_id TEXT,
          clear_notes TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_cooldowns_symbol_active
          ON cooldowns(symbol, cleared_at, until_ts);
      `);
      this.ensureCooldownColumns();
    });
  }

  private ensureCooldownColumns(): void {
    const rows = this.db.prepare("PRAGMA table_info(cooldowns)").all() as Array<{ name: string }>;
    const columns = new Set(rows.map((row) => row.name));
    if (!columns.has("clear_cycle_id")) {
      this.db.exec("ALTER TABLE cooldowns ADD COLUMN clear_cycle_id TEXT;");
    }
    if (!columns.has("clear_notes")) {
      this.db.exec("ALTER TABLE cooldowns ADD COLUMN clear_notes TEXT;");
    }
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
    const hasExecution = current.hasExecution || isExecutionFlagEvent(record);
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

  private withWriteTransaction<T>(operation: () => T): T {
    return withSqliteBusyRetry(() => {
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        const result = operation();
        this.db.exec("COMMIT;");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK;");
        throw error;
      }
    });
  }
}

function withSqliteBusyRetry<T>(operation: () => T): T {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SQLITE_WRITE_RETRIES; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!isSqliteBusyError(error) || attempt === SQLITE_WRITE_RETRIES) {
        throw error;
      }
    }
  }
  throw lastError;
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /\b(SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked)\b/i.test(error.message);
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

function cooldownFromRow(row: CooldownRow): CooldownEntry {
  return {
    cooldownId: row.cooldown_id,
    symbol: row.symbol,
    side: row.side,
    reason: row.reason,
    startedAt: row.started_at,
    untilTs: row.until_ts,
    cycleId: row.cycle_id ?? undefined,
    notes: row.notes ?? undefined,
    clearedAt: row.cleared_at ?? undefined,
    clearReason: row.clear_reason ?? undefined,
    clearCycleId: row.clear_cycle_id ?? undefined,
    clearNotes: row.clear_notes ?? undefined
  };
}

function isCooldownReason(value: unknown): value is CooldownReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DEFAULT_COOLDOWN_SECONDS, value);
}

function isExecutionFlagEvent(record: Pick<AuditEventRecord, "type" | "tags">): boolean {
  if (record.type === "order.dry_run") {
    return !hasNormalizedTag(record.tags, "no_order");
  }
  return record.type === "order.submitted" || record.type === "action.executed" || record.type === "action.remediated";
}

function hasNormalizedTag(tags: string[], target: string): boolean {
  return tags.some((tag) => tag.toLowerCase().replace(/[-\s]+/g, "_") === target);
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
  const normalizedPhase = phase.toLowerCase();
  return candidates.some((candidate) => {
    const normalizedCandidate = candidate.toLowerCase();
    return (
      normalizedPhase === normalizedCandidate ||
      normalizedPhase.startsWith(`${normalizedCandidate}.`) ||
      normalizedPhase.startsWith(`${normalizedCandidate}_`) ||
      normalizedPhase.startsWith(`${normalizedCandidate}-`)
    );
  });
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

function buildCycleWhere(query: CycleQuery): { where: string; params: QueryParam[] } {
  const clauses: string[] = [];
  const params: QueryParam[] = [];
  if (query.status) {
    clauses.push("status = ?");
    params.push(query.status);
  }
  if (query.symbol) {
    clauses.push("instr(lower(symbols_json), ?) > 0");
    params.push(query.symbol.toLowerCase());
  }
  if (query.from) {
    clauses.push("started_at >= ?");
    params.push(query.from);
  }
  if (query.to) {
    clauses.push("started_at <= ?");
    params.push(query.to);
  }
  if (query.q) {
    clauses.push(
      [
        "instr(lower(cycle_id), ?) > 0",
        "instr(lower(status), ?) > 0",
        "instr(lower(COALESCE(summary, '')), ?) > 0",
        "instr(lower(symbols_json), ?) > 0"
      ].join(" OR ")
    );
    params.push(...Array<QueryParam>(4).fill(query.q.toLowerCase()));
  }
  return { where: clauses.length ? `WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}` : "", params };
}

function buildEventWhere(cycleId: string, query: EventQuery): { where: string; params: QueryParam[] } {
  const clauses = ["cycle_id = ?"];
  const params: QueryParam[] = [cycleId];
  if (query.phases?.length) {
    clauses.push(`phase IN (${query.phases.map(() => "?").join(", ")})`);
    params.push(...query.phases);
  }
  if (query.type) {
    clauses.push("instr(lower(type), ?) > 0");
    params.push(query.type.toLowerCase());
  }
  if (query.symbol) {
    clauses.push("instr(lower(COALESCE(symbol, 'all')), ?) > 0");
    params.push(query.symbol.toLowerCase());
  }
  if (query.severity) {
    clauses.push("severity = ?");
    params.push(query.severity);
  }
  if (query.q) {
    clauses.push(
      [
        "instr(lower(event_id), ?) > 0",
        "instr(lower(type), ?) > 0",
        "instr(lower(phase), ?) > 0",
        "instr(lower(summary), ?) > 0",
        "instr(lower(COALESCE(symbol, '')), ?) > 0",
        "instr(lower(payload_hash), ?) > 0",
        "instr(lower(tags_json), ?) > 0"
      ].join(" OR ")
    );
    params.push(...Array<QueryParam>(7).fill(query.q.toLowerCase()));
  }
  return { where: `WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}`, params };
}

function countRows(db: DatabaseSync, sql: string, params: QueryParam[]): number {
  const row = db.prepare(sql).get(...params) as { total: number };
  return row.total;
}

function pageRows<T>(items: T[], total: number, limit: number, offset: number): PagedResult<T> {
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < total ? String(nextOffset) : undefined,
    total
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? NaN)) {
    return 50;
  }
  return Math.max(1, Math.min(250, Math.trunc(limit!)));
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function cycleGaps(cycle: AuditCycleRecord, events: AuditEventRecord[]): string[] {
  const gaps: string[] = [];
  if (!events.some((event) => event.type === "summary.finalized")) {
    gaps.push("缺少每轮结束必须写入的 summary.finalized");
  }
  if (!events.some((event) => phaseMatches(event.phase, ["preflight", "data", "market"]))) {
    gaps.push("缺少账户、仓位、订单或市场数据记录");
  }
  if (!events.some(isScreeningEvent)) {
    gaps.push("缺少筛选路径或自由分析记录");
  }
  if (!events.some(isPortfolioEvent)) {
    gaps.push("缺少组合层面的决策记录");
  }
  if (!events.some((event) => phaseMatches(event.phase, ["action", "execution"]))) {
    gaps.push("缺少动作、执行或明确放弃动作的记录");
  }
  if (cycle.hasExecution && !events.some((event) => event.type === "post.verify" || phaseMatches(event.phase, ["verification", "post"]))) {
    gaps.push("已有执行链路但缺少执行后复核记录");
  }
  return gaps;
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
