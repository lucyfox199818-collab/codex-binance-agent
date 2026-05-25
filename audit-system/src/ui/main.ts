import type {
  AuditCycleRecord,
  AuditEventRecord,
  CycleOverview,
  CycleReport,
  PagedResult,
  ReviewNote,
  SymbolDecision
} from "../shared/types";
import {
  advanceCursor,
  normalizePagedResponse,
  pageRows,
  phasesForTab,
  retreatCursor,
  type CursorState,
  type WorkspaceTab
} from "./workbench";
import "./styles.css";

interface PageState extends CursorState {
  nextCursor?: string;
  total: number;
}

interface AppState {
  cycles: AuditCycleRecord[];
  cyclePage: PageState;
  selectedCycleId?: string;
  overview?: CycleOverview;
  events: AuditEventRecord[];
  eventPage: PageState;
  selectedEventId?: string;
  payloadCache: Map<string, unknown>;
  selectedPayload?: unknown;
  selectedPayloadEventId?: string;
  report?: CycleReport;
  reportCycleId?: string;
  symbolDecisions: SymbolDecision[];
  diff?: { left: unknown; right: unknown; changedKeys: string[] };
  cycleFilter: string;
  statusFilter: string;
  symbolFilter: string;
  eventFilter: string;
  activeTab: WorkspaceTab;
  cycleScrollTop: number;
  eventScrollTop: number;
  loading: string;
  error?: string;
}

const PAGE_SIZE = 50;

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "timeline", label: "时间线" },
  { id: "data", label: "策略/数据" },
  { id: "analysis", label: "分析/决策" },
  { id: "risk", label: "风险/执行" },
  { id: "diff", label: "Diff" },
  { id: "notes", label: "备注" },
  { id: "report", label: "完整报告" }
];

const state: AppState = {
  cycles: [],
  cyclePage: { previousCursors: [], total: 0 },
  events: [],
  eventPage: { previousCursors: [], total: 0 },
  payloadCache: new Map(),
  symbolDecisions: [],
  cycleFilter: "",
  statusFilter: "",
  symbolFilter: "",
  eventFilter: "",
  activeTab: "overview",
  cycleScrollTop: 0,
  eventScrollTop: 0,
  loading: ""
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function loadCycles(options: { resetCursor?: boolean; keepSelection?: boolean } = {}): Promise<void> {
  if (options.resetCursor) {
    state.cyclePage = { previousCursors: [], total: 0 };
    state.cycleScrollTop = 0;
  }
  state.loading = "cycles";
  render();
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (state.cyclePage.cursor) {
    params.set("cursor", state.cyclePage.cursor);
  }
  if (state.cycleFilter.trim()) {
    params.set("q", state.cycleFilter.trim());
  }
  if (state.statusFilter) {
    params.set("status", state.statusFilter);
  }
  if (state.symbolFilter.trim()) {
    params.set("symbol", state.symbolFilter.trim());
  }
  const page = normalizePagedResponse(
    await api<PagedResult<AuditCycleRecord> | AuditCycleRecord[]>(`/api/cycles?${params.toString()}`)
  );
  state.cycles = page.items;
  state.cyclePage = {
    cursor: state.cyclePage.cursor,
    previousCursors: state.cyclePage.previousCursors,
    nextCursor: page.nextCursor,
    total: page.total
  };
  if (!options.keepSelection || !state.cycles.some((cycle) => cycle.cycleId === state.selectedCycleId)) {
    state.selectedCycleId = state.cycles[0]?.cycleId;
  }
  state.loading = "";
  await loadSelectedCycle();
}

async function loadSelectedCycle(): Promise<void> {
  state.overview = undefined;
  state.events = [];
  state.selectedEventId = undefined;
  state.selectedPayload = undefined;
  state.selectedPayloadEventId = undefined;
  state.diff = undefined;
  state.report = undefined;
  state.reportCycleId = undefined;
  state.eventPage = { previousCursors: [], total: 0 };
  state.eventScrollTop = 0;
  if (!state.selectedCycleId) {
    render();
    return;
  }
  state.loading = "cycle";
  render();
  state.overview = await api<CycleOverview>(`/api/cycles/${encodeURIComponent(state.selectedCycleId)}/overview`);
  const firstSymbol = state.overview.cycle.symbols[0];
  state.symbolDecisions = firstSymbol
    ? await api<SymbolDecision[]>(`/api/symbols/${encodeURIComponent(firstSymbol)}/decisions`)
    : [];
  state.loading = "";
  await loadEvents();
}

async function loadEvents(options: { resetCursor?: boolean } = {}): Promise<void> {
  if (!state.selectedCycleId) {
    render();
    return;
  }
  if (options.resetCursor) {
    state.eventPage = { previousCursors: [], total: 0 };
    state.eventScrollTop = 0;
  }
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (state.eventPage.cursor) {
    params.set("cursor", state.eventPage.cursor);
  }
  if (state.eventFilter.trim()) {
    params.set("q", state.eventFilter.trim());
  }
  for (const phase of phasesForTab(state.activeTab)) {
    params.append("phase", phase);
  }
  state.loading = "events";
  render();
  const page = normalizePagedResponse(
    await api<PagedResult<AuditEventRecord> | AuditEventRecord[]>(
      `/api/cycles/${encodeURIComponent(state.selectedCycleId)}/events?${params.toString()}`
    )
  );
  state.events = page.items;
  state.eventPage = {
    cursor: state.eventPage.cursor,
    previousCursors: state.eventPage.previousCursors,
    nextCursor: page.nextCursor,
    total: page.total
  };
  state.selectedEventId = state.events.some((event) => event.eventId === state.selectedEventId)
    ? state.selectedEventId
    : state.events[0]?.eventId;
  state.selectedPayload = undefined;
  state.selectedPayloadEventId = undefined;
  state.loading = "";
  render();
}

async function loadSelectedPayload(): Promise<void> {
  if (!state.selectedEventId) {
    return;
  }
  if (!state.payloadCache.has(state.selectedEventId)) {
    state.loading = "payload";
    render();
    state.payloadCache.set(
      state.selectedEventId,
      await api<unknown>(`/api/events/${encodeURIComponent(state.selectedEventId)}/payload`)
    );
  }
  state.selectedPayload = state.payloadCache.get(state.selectedEventId);
  state.selectedPayloadEventId = state.selectedEventId;
  state.loading = "";
  render();
}

async function loadFullReport(): Promise<void> {
  if (!state.selectedCycleId) {
    return;
  }
  if (state.reportCycleId !== state.selectedCycleId) {
    state.loading = "report";
    render();
    state.report = await api<CycleReport>(`/api/cycles/${encodeURIComponent(state.selectedCycleId)}/report`);
    state.reportCycleId = state.selectedCycleId;
    state.loading = "";
  }
  render();
}

function render(): void {
  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div>
          <h1>Trading Audit</h1>
          <span class="subtle">本地审计工作台</span>
        </div>
        <div class="status">${renderStatus()}</div>
      </header>
      <div class="shell workbench-shell">
        <aside class="sidebar cycle-pane">${renderCycleNavigator()}</aside>
        <main class="main workbench-main">${renderWorkspace()}</main>
        <aside class="detail-pane">${renderEventDetail()}</aside>
      </div>
    </div>
  `;
  restoreScrollPositions();
  bindEvents();
}

function renderStatus(): string {
  if (state.error) {
    return `<span class="badge warn">错误</span> ${escapeHtml(state.error)}`;
  }
  if (state.loading) {
    return `<span class="badge">加载 ${escapeHtml(state.loading)}</span>`;
  }
  return `${state.cyclePage.total} cycles`;
}

function renderCycleNavigator(): string {
  return `
    <div class="pane-head">
      <h2>轮次</h2>
      <span>${state.cycles.length}/${state.cyclePage.total}</span>
    </div>
    <div class="filter-stack">
      <input class="search" id="cycle-filter" placeholder="搜索 cycle / symbol / status" value="${escapeHtml(state.cycleFilter)}" />
      <div class="filter-row">
        <select id="status-filter" aria-label="status">
          ${renderOption("", "全部状态", state.statusFilter)}
          ${renderOption("running", "running", state.statusFilter)}
          ${renderOption("completed", "completed", state.statusFilter)}
          ${renderOption("error", "error", state.statusFilter)}
        </select>
        <input id="symbol-filter" class="compact-input" placeholder="symbol" value="${escapeHtml(state.symbolFilter)}" />
      </div>
    </div>
    ${renderCycleList()}
    ${renderPager("cycle", state.cyclePage)}
  `;
}

function renderCycleList(): string {
  return `
    <div class="scroll-list cycle-list" id="cycle-list-scroll" style="height: min(560px, calc(100vh - 230px));">
      ${pageRows(state.cycles).map(renderCycleButton).join("")}
    </div>
  `;
}

function renderCycleButton(cycle: AuditCycleRecord): string {
  return `
    <button class="cycle-button ${cycle.cycleId === state.selectedCycleId ? "active" : ""}" data-cycle-id="${escapeAttr(cycle.cycleId)}">
      <span class="cycle-id">${escapeHtml(cycle.cycleId)}</span>
      <span class="cycle-meta">
        <span>${escapeHtml(cycle.status)}</span>
        <span>${cycle.eventCount} events</span>
        <span>${cycle.hasExecution ? "execution" : "no execution"}</span>
      </span>
      <span class="cycle-meta">${escapeHtml(cycle.symbols.join(", ") || "no symbols")}</span>
    </button>
  `;
}

function renderWorkspace(): string {
  if (!state.selectedCycleId || !state.overview) {
    return renderEmpty();
  }
  return `
    <section class="overview-band sticky-summary">
      <div class="overview-head">
        <div>
          <h2>${escapeHtml(state.overview.cycle.cycleId)}</h2>
          <p>${escapeHtml(state.overview.cycle.summary ?? state.overview.lastEvent?.summary ?? "当前轮次没有最终总结")}</p>
        </div>
        <span class="badge ${state.overview.verification.ok ? "ok" : "warn"}">
          ${state.overview.verification.ok ? "审计通过" : "需处理"}
        </span>
      </div>
      <div class="kpi-grid">
        ${renderMetric("状态", state.overview.cycle.status)}
        ${renderMetric("事件数", state.overview.cycle.eventCount)}
        ${renderMetric("当前结果数", `${state.events.length}/${state.eventPage.total}`)}
        ${renderMetric("最终总结", state.overview.finalSummarySequence ? `#${state.overview.finalSummarySequence}` : "缺失")}
        ${renderMetric("执行链路", state.overview.cycle.hasExecution ? "有" : "无")}
        ${renderMetric("交易标的", state.overview.cycle.symbols.join(", ") || "无")}
      </div>
    </section>
    <nav class="tabs">
      ${tabs
        .map(
          (tab) => `
            <button class="tab ${state.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
              ${escapeHtml(tab.label)}
            </button>
          `
        )
        .join("")}
    </nav>
    <section class="workspace-panel">${renderActiveTab()}</section>
  `;
}

function renderActiveTab(): string {
  if (!state.overview) {
    return renderEmpty();
  }
  if (state.activeTab === "overview") {
    return renderOverviewTab(state.overview);
  }
  if (state.activeTab === "diff") {
    return renderDiffTab();
  }
  if (state.activeTab === "notes") {
    return renderNotesTab();
  }
  if (state.activeTab === "report") {
    return renderReportTab();
  }
  return renderEventTab();
}

function renderOverviewTab(overview: CycleOverview): string {
  return `
    <div class="dashboard-grid">
      <section class="panel">
        <h3>链路完整性</h3>
        ${renderVerificationNotice(overview)}
        ${renderGaps(overview.gaps)}
      </section>
      <section class="panel">
        <h3>阶段分布</h3>
        ${renderCountList(overview.phaseCounts)}
      </section>
      <section class="panel">
        <h3>Symbol 历史</h3>
        ${renderSymbolHistory()}
      </section>
      <section class="panel">
        <h3>最近事件</h3>
        ${overview.lastEvent ? renderEventMini(overview.lastEvent) : `<p class="muted">暂无事件</p>`}
      </section>
    </div>
  `;
}

function renderEventTab(): string {
  return `
    <div class="table-toolbar">
      <input class="search" id="event-filter" placeholder="搜索事件 / type / summary / payload hash" value="${escapeHtml(state.eventFilter)}" />
      ${renderPager("event", state.eventPage)}
    </div>
    ${renderEventList()}
  `;
}

function renderEventList(): string {
  if (!state.events.length) {
    return `<p class="muted">当前筛选下暂无事件</p>`;
  }
  return `
    <div class="scroll-list event-list" id="event-list-scroll" style="height: min(540px, calc(100vh - 300px));">
      ${pageRows(state.events).map(renderEventButton).join("")}
    </div>
  `;
}

function renderEventButton(event: AuditEventRecord): string {
  return `
    <button class="event-button ${event.eventId === state.selectedEventId ? "active" : ""}" data-event-id="${escapeAttr(event.eventId)}">
      <span class="event-title">
        <strong>#${event.sequence} ${escapeHtml(event.type)}</strong>
        <span>${escapeHtml(event.phase)}</span>
      </span>
      <span class="event-summary">${escapeHtml(event.summary)}</span>
      <span class="cycle-meta">${escapeHtml(event.symbol ?? "all")} · payload ${escapeHtml(event.payloadHash.slice(0, 12))}</span>
    </button>
  `;
}

function renderDiffTab(): string {
  const options = state.events
    .map((event) => `<option value="${escapeAttr(event.eventId)}">#${event.sequence} ${escapeHtml(event.type)}</option>`)
    .join("");
  return `
    <div class="table-toolbar">
      <input class="search" id="event-filter" placeholder="筛选可比较事件" value="${escapeHtml(state.eventFilter)}" />
      ${renderPager("event", state.eventPage)}
    </div>
    <div class="form diff-form">
      <select id="diff-left">${options}</select>
      <select id="diff-right">${options}</select>
      <button class="primary" id="run-diff" ${state.events.length < 2 ? "disabled" : ""}>比较 payload</button>
    </div>
    ${
      state.diff
        ? `<p class="muted">Changed keys: ${escapeHtml(state.diff.changedKeys.join(", ") || "none")}</p>
           <div class="two-col"><pre>${escapeHtml(JSON.stringify(state.diff.left, null, 2))}</pre><pre>${escapeHtml(JSON.stringify(state.diff.right, null, 2))}</pre></div>`
        : `<p class="muted">选择两个事件后按需加载 payload diff。</p>`
    }
  `;
}

function renderNotesTab(): string {
  const notes = state.reportCycleId === state.selectedCycleId ? state.report?.notes ?? [] : [];
  return `
    <div class="table-toolbar">
      <button class="secondary" id="load-report-notes">加载备注</button>
    </div>
    ${renderNotes(notes)}
  `;
}

function renderReportTab(): string {
  return `
    <div class="table-toolbar">
      <button class="secondary" id="load-full-report">加载完整报告</button>
    </div>
    ${
      state.reportCycleId === state.selectedCycleId && state.report
        ? `<pre class="report-pre">${escapeHtml(JSON.stringify(state.report, null, 2))}</pre>`
        : `<p class="muted">完整 JSON 报告默认不渲染，点击后按需加载。</p>`
    }
  `;
}

function renderEventDetail(): string {
  const event = state.events.find((item) => item.eventId === state.selectedEventId);
  if (!event) {
    return `
      <div class="pane-head"><h2>事件详情</h2></div>
      <p class="muted">选择事件后查看详情。</p>
    `;
  }
  return `
    <div class="pane-head">
      <h2>事件详情</h2>
      <span>#${event.sequence}</span>
    </div>
    <table class="detail-table">
      <tbody>
        <tr><th>type</th><td>${escapeHtml(event.type)}</td></tr>
        <tr><th>phase</th><td>${escapeHtml(event.phase)}</td></tr>
        <tr><th>symbol</th><td>${escapeHtml(event.symbol ?? "all")}</td></tr>
        <tr><th>summary</th><td>${escapeHtml(event.summary)}</td></tr>
        <tr><th>payload</th><td>${escapeHtml(event.payloadHash)}</td></tr>
        <tr><th>event</th><td>${escapeHtml(event.eventHash)}</td></tr>
      </tbody>
    </table>
    <button class="primary full-width" id="load-payload">${state.selectedPayloadEventId === event.eventId ? "刷新 Payload" : "加载 Payload"}</button>
    ${
      state.selectedPayloadEventId === event.eventId
        ? `<pre>${escapeHtml(JSON.stringify(state.selectedPayload, null, 2))}</pre>`
        : `<p class="muted">Raw payload 按需加载，避免大数据时默认撑满页面。</p>`
    }
  `;
}

function renderPager(kind: "cycle" | "event", page: PageState): string {
  return `
    <div class="pager">
      <button class="icon-button" data-page="${kind}-prev" ${page.previousCursors.length ? "" : "disabled"}>上一页</button>
      <span>${page.total ? `${pageCursorLabel(page)} / ${page.total}` : "0 / 0"}</span>
      <button class="icon-button" data-page="${kind}-next" ${page.nextCursor ? "" : "disabled"}>下一页</button>
    </div>
  `;
}

function pageCursorLabel(page: PageState): string {
  const start = page.cursor ? Number.parseInt(page.cursor, 10) + 1 : 1;
  const end = Math.min(page.total, start + PAGE_SIZE - 1);
  return `${start}-${end}`;
}

function renderMetric(label: string, value: string | number): string {
  return `
    <div class="metric">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function renderVerificationNotice(overview: CycleOverview): string {
  if (overview.verification.ok) {
    return `<div class="notice ok-bg">事件链索引和最终总结存在性校验通过，共检查 ${overview.verification.checkedEvents} 个事件；完整 payload 校验在报告/verify 接口中按需执行。</div>`;
  }
  return `
    <div class="notice warn-bg">
      审计未通过：${escapeHtml(overview.verification.reason ?? "unknown")}
      ${overview.verification.brokenAtEventId ? `，定位事件 ${escapeHtml(overview.verification.brokenAtEventId)}` : ""}
    </div>
  `;
}

function renderGaps(gaps: string[]): string {
  if (!gaps.length) {
    return `<div class="notice ok-bg">主链路记录完整。</div>`;
  }
  return `<ul class="gap-list">${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>`;
}

function renderCountList(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length) {
    return `<p class="muted">暂无阶段计数</p>`;
  }
  return `
    <div class="count-list">
      ${entries.map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong>${value}</span>`).join("")}
    </div>
  `;
}

function renderSymbolHistory(): string {
  if (!state.symbolDecisions.length) {
    return "<p class=\"muted\">当前轮没有 symbol 决策记录</p>";
  }
  return `
    <div class="event-card-list compact">
      ${state.symbolDecisions
        .slice(0, 8)
        .map(
          (decision) => `
            <div class="event-mini">
              <strong>${escapeHtml(decision.symbol)} · ${escapeHtml(decision.type)}</strong>
              <span>${escapeHtml(decision.summary)}</span>
              <span class="cycle-meta">${escapeHtml(decision.timestamp)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEventMini(event: AuditEventRecord): string {
  return `
    <button class="event-mini as-button" data-event-id="${escapeAttr(event.eventId)}">
      <strong>#${event.sequence} ${escapeHtml(event.type)}</strong>
      <span>${escapeHtml(event.summary)}</span>
      <span class="cycle-meta">${escapeHtml(event.phase)} · ${escapeHtml(event.symbol ?? "all")}</span>
    </button>
  `;
}

function renderNotes(notes: ReviewNote[]): string {
  return `
    <form class="form" id="note-form">
      <textarea id="note-body" placeholder="记录复盘观察"></textarea>
      <button class="primary" type="submit">保存备注</button>
    </form>
    <div class="note-list">
      ${notes
        .map(
          (note) => `
            <article class="note">
              <strong>${escapeHtml(note.author)}</strong>
              <span class="cycle-meta">${escapeHtml(note.timestamp)} · ${escapeHtml(note.tags.join(", ") || "review")}</span>
              <p>${escapeHtml(note.body)}</p>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderOption(value: string, label: string, selected: string): string {
  return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderEmpty(): string {
  return `<section class="panel"><h2>暂无审计数据</h2><p>先运行 <code>npm run sample</code> 生成示例轮次。</p></section>`;
}

function bindEvents(): void {
  document.querySelector<HTMLInputElement>("#cycle-filter")?.addEventListener("change", async (event) => {
    state.cycleFilter = (event.target as HTMLInputElement).value;
    await runUiAction(() => loadCycles({ resetCursor: true }));
  });
  document.querySelector<HTMLSelectElement>("#status-filter")?.addEventListener("change", async (event) => {
    state.statusFilter = (event.target as HTMLSelectElement).value;
    await runUiAction(() => loadCycles({ resetCursor: true }));
  });
  document.querySelector<HTMLInputElement>("#symbol-filter")?.addEventListener("change", async (event) => {
    state.symbolFilter = (event.target as HTMLInputElement).value;
    await runUiAction(() => loadCycles({ resetCursor: true }));
  });
  document.querySelector<HTMLInputElement>("#event-filter")?.addEventListener("change", async (event) => {
    state.eventFilter = (event.target as HTMLInputElement).value;
    await runUiAction(() => loadEvents({ resetCursor: true }));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-cycle-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedCycleId = button.dataset.cycleId;
      await runUiAction(loadSelectedCycle);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-event-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedEventId = button.dataset.eventId;
      state.selectedPayload = undefined;
      state.selectedPayloadEventId = undefined;
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.activeTab = button.dataset.tab as WorkspaceTab;
      await runUiAction(() => loadEvents({ resetCursor: true }));
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runUiAction(() => handlePageClick(button.dataset.page ?? ""));
    });
  });
  document.querySelector<HTMLButtonElement>("#load-payload")?.addEventListener("click", async () => {
    await runUiAction(loadSelectedPayload);
  });
  document.querySelector<HTMLButtonElement>("#load-full-report")?.addEventListener("click", async () => {
    await runUiAction(loadFullReport);
  });
  document.querySelector<HTMLButtonElement>("#load-report-notes")?.addEventListener("click", async () => {
    await runUiAction(loadFullReport);
  });
  document.querySelector<HTMLButtonElement>("#run-diff")?.addEventListener("click", async () => {
    await runUiAction(runDiff);
  });
  document.querySelector<HTMLFormElement>("#note-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runUiAction(saveNote);
  });
  document.querySelector<HTMLDivElement>("#cycle-list-scroll")?.addEventListener("scroll", (event) => {
    state.cycleScrollTop = (event.target as HTMLDivElement).scrollTop;
  });
  document.querySelector<HTMLDivElement>("#event-list-scroll")?.addEventListener("scroll", (event) => {
    state.eventScrollTop = (event.target as HTMLDivElement).scrollTop;
  });
}

async function handlePageClick(action: string): Promise<void> {
  if (action === "cycle-next" && state.cyclePage.nextCursor) {
    state.cyclePage = { ...state.cyclePage, ...advanceCursor(state.cyclePage, state.cyclePage.nextCursor) };
    await loadCycles({ keepSelection: true });
  }
  if (action === "cycle-prev") {
    state.cyclePage = { ...state.cyclePage, ...retreatCursor(state.cyclePage) };
    await loadCycles({ keepSelection: true });
  }
  if (action === "event-next" && state.eventPage.nextCursor) {
    state.eventPage = { ...state.eventPage, ...advanceCursor(state.eventPage, state.eventPage.nextCursor) };
    await loadEvents();
  }
  if (action === "event-prev") {
    state.eventPage = { ...state.eventPage, ...retreatCursor(state.eventPage) };
    await loadEvents();
  }
}

async function runDiff(): Promise<void> {
  const left = document.querySelector<HTMLSelectElement>("#diff-left")?.value;
  const right = document.querySelector<HTMLSelectElement>("#diff-right")?.value;
  if (left && right) {
    state.loading = "diff";
    render();
    state.diff = await api(`/api/diff?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`);
    state.loading = "";
    render();
  }
}

async function saveNote(): Promise<void> {
  const body = document.querySelector<HTMLTextAreaElement>("#note-body")?.value.trim();
  if (!body || !state.selectedCycleId) {
    return;
  }
  await api(`/api/cycles/${encodeURIComponent(state.selectedCycleId)}/notes`, {
    method: "POST",
    body: JSON.stringify({ author: "local", body, tags: ["review"] })
  });
  state.reportCycleId = undefined;
  await loadFullReport();
}

async function runUiAction(action: () => Promise<void>): Promise<void> {
  try {
    state.error = undefined;
    await action();
  } catch (error) {
    state.loading = "";
    state.error = error instanceof Error ? error.message : String(error);
    render();
  }
}

function restoreScrollPositions(): void {
  requestAnimationFrame(() => {
    const cycleList = document.querySelector<HTMLDivElement>("#cycle-list-scroll");
    if (cycleList) {
      cycleList.scrollTop = state.cycleScrollTop;
    }
    const eventList = document.querySelector<HTMLDivElement>("#event-list-scroll");
    if (eventList) {
      eventList.scrollTop = state.eventScrollTop;
    }
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

runUiAction(() => loadCycles()).catch((error: unknown) => {
  app.innerHTML = `<pre>${escapeHtml(error instanceof Error ? error.stack ?? error.message : String(error))}</pre>`;
});
