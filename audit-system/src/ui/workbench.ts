import type { AuditEventRecord, AuditPhase, PagedResult } from "../shared/types";

export type WorkspaceTab = "overview" | "timeline" | "data" | "analysis" | "risk" | "diff" | "notes" | "report";

export interface CursorState {
  cursor?: string;
  previousCursors: string[];
}

export interface VisibleWindowInput {
  total: number;
  scrollTop: number;
  rowHeight: number;
  viewportHeight: number;
  overscan?: number;
}

export interface VisibleWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

const TAB_PHASES: Record<WorkspaceTab, AuditPhase[]> = {
  overview: [],
  timeline: [],
  data: ["strategy", "preflight", "data", "market"],
  analysis: ["analysis", "candidate", "decision", "intent", "cta"],
  risk: ["risk", "action", "execution", "verification"],
  diff: [],
  notes: ["review", "summary"],
  report: []
};

export function phasesForTab(tab: WorkspaceTab): AuditPhase[] {
  return [...TAB_PHASES[tab]];
}

export function normalizePagedResponse<T>(value: T[] | PagedResult<T>): PagedResult<T> {
  if (Array.isArray(value)) {
    return { items: value, total: value.length };
  }
  return value;
}

export function pageRows<T>(items: T[]): T[] {
  return [...items];
}

export function advanceCursor(state: CursorState, nextCursor: string): CursorState {
  return {
    cursor: nextCursor,
    previousCursors: [...state.previousCursors, state.cursor ?? ""]
  };
}

export function retreatCursor(state: CursorState): CursorState {
  if (!state.previousCursors.length) {
    return { cursor: undefined, previousCursors: [] };
  }
  const previousCursors = state.previousCursors.slice(0, -1);
  const cursor = state.previousCursors.at(-1) || undefined;
  return { cursor, previousCursors };
}

export function visibleWindow(input: VisibleWindowInput): VisibleWindow {
  const total = Math.max(0, Math.trunc(input.total));
  const rowHeight = Math.max(1, input.rowHeight);
  const viewportHeight = Math.max(rowHeight, input.viewportHeight);
  const overscan = Math.max(0, input.overscan ?? 3);
  const firstVisible = Math.floor(Math.max(0, input.scrollTop) / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const end = Math.min(total, start + visibleRows);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, total - end) * rowHeight
  };
}

export function queryForTab(tab: WorkspaceTab): URLSearchParams {
  const params = new URLSearchParams();
  for (const phase of phasesForTab(tab)) {
    params.append("phase", phase);
  }
  return params;
}

export function eventSummary(event: AuditEventRecord): string {
  return `#${event.sequence} ${event.type} ${event.symbol ?? "all"} ${event.summary}`;
}
