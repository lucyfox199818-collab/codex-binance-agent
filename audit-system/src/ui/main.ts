import type { AuditCycleRecord, AuditEventRecord, CycleReport, ReviewNote, SymbolDecision } from "../shared/types";
import "./styles.css";

interface AppState {
  cycles: AuditCycleRecord[];
  selectedCycleId?: string;
  selectedEventId?: string;
  selectedPayload?: unknown;
  report?: CycleReport;
  symbolDecisions: SymbolDecision[];
  diff?: { left: unknown; right: unknown; changedKeys: string[] };
  filter: string;
}

const state: AppState = {
  cycles: [],
  symbolDecisions: [],
  filter: ""
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

async function loadCycles(): Promise<void> {
  state.cycles = await api<AuditCycleRecord[]>("/api/cycles");
  state.selectedCycleId ??= state.cycles[0]?.cycleId;
  await loadSelectedCycle();
}

async function loadSelectedCycle(): Promise<void> {
  if (!state.selectedCycleId) {
    render();
    return;
  }
  state.report = await api<CycleReport>(`/api/cycles/${encodeURIComponent(state.selectedCycleId)}/report`);
  state.selectedEventId ??= state.report.events[0]?.eventId;
  await loadSelectedPayload();
  const firstSymbol = state.report.cycle.symbols[0];
  state.symbolDecisions = firstSymbol
    ? await api<SymbolDecision[]>(`/api/symbols/${encodeURIComponent(firstSymbol)}/decisions`)
    : [];
  render();
}

async function loadSelectedPayload(): Promise<void> {
  state.selectedPayload = state.selectedEventId
    ? await api<unknown>(`/api/events/${encodeURIComponent(state.selectedEventId)}/payload`)
    : undefined;
}

function render(): void {
  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <h1>Trading Audit</h1>
        <div class="status">${state.cycles.length} cycles loaded</div>
      </header>
      <div class="shell">
        <aside class="sidebar">
          <input class="search" id="cycle-filter" placeholder="搜索 cycle / symbol / status" value="${escapeHtml(state.filter)}" />
          <div class="cycle-list">${renderCycleList()}</div>
        </aside>
        <main class="main">${state.report ? renderReport(state.report) : renderEmpty()}</main>
      </div>
    </div>
  `;
  bindEvents();
}

function renderCycleList(): string {
  const filtered = state.cycles.filter((cycle) => {
    const haystack = `${cycle.cycleId} ${cycle.status} ${cycle.symbols.join(" ")}`.toLowerCase();
    return haystack.includes(state.filter.toLowerCase());
  });
  return filtered
    .map(
      (cycle) => `
        <button class="cycle-button ${cycle.cycleId === state.selectedCycleId ? "active" : ""}" data-cycle-id="${escapeAttr(cycle.cycleId)}">
          <div class="cycle-id">${escapeHtml(cycle.cycleId)}</div>
          <div class="cycle-meta">
            <span>${escapeHtml(cycle.status)}</span>
            <span>${cycle.eventCount} events</span>
            <span>${cycle.hasExecution ? "execution" : "no execution"}</span>
          </div>
          <div class="cycle-meta">${escapeHtml(cycle.symbols.join(", ") || "no symbols")}</div>
        </button>
      `
    )
    .join("");
}

function renderReport(report: CycleReport): string {
  const v3Report = isV3Report(report);
  return `
    <div class="report-stack">
      ${v3Report ? renderV3Overview(report) : ""}
      <div class="grid">
      <section class="panel">
        <h2>链路时间线 <span class="badge ${report.verification.ok ? "ok" : "warn"}">${report.verification.ok ? "审计通过" : "审计异常"}</span></h2>
        <div class="timeline">${report.events.map(renderEventButton).join("")}</div>
      </section>
      <section class="panel">
        <h2>事件详情</h2>
        ${renderSelectedEvent(report.events)}
      </section>
      <section class="panel">
        <h2>策略与数据</h2>
        ${renderEventTable([...report.strategyEvents, ...report.dataEvents])}
      </section>
      <section class="panel">
        <h2>自由分析</h2>
        ${renderEventTable(report.analysisEvents)}
      </section>
      <section class="panel">
        <h2>统一决策</h2>
        ${renderEventTable(report.decisionEvents)}
      </section>
      <section class="panel">
        <h2>风险核验</h2>
        ${renderEventTable(report.riskEvents)}
      </section>
      <section class="panel">
        <h2>动作链路</h2>
        ${renderEventTable(report.actionEvents)}
      </section>
      <section class="panel">
        <h2>筛选与触发</h2>
        ${renderEventTable(report.candidates)}
      </section>
      <section class="panel">
        <h2>执行与复核</h2>
        ${renderEventTable(uniqueEvents([...report.executionEvents, ...report.verificationEvents]))}
      </section>
      <section class="panel">
        <h2>Payload Diff</h2>
        ${renderDiff(report.events)}
      </section>
      <section class="panel">
        <h2>Symbol 历史</h2>
        ${renderSymbolHistory()}
      </section>
      <section class="panel">
        <h2>复盘备注</h2>
        ${renderNotes(report.notes)}
      </section>
      <section class="panel">
        <h2>复盘报告</h2>
        <pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre>
      </section>
      </div>
    </div>
  `;
}

function renderV3Overview(report: CycleReport): string {
  const finalSummary = report.summaryEvents.find((event) => event.type === "summary.finalized");
  const actionBasis = uniqueEvents([
    ...report.riskEvents,
    ...report.actionEvents,
    ...report.executionEvents.filter((event) => event.phase !== "verification")
  ]);
  const reviewEvents = uniqueEvents([...report.verificationEvents, ...report.summaryEvents]);
  const lastEvent = report.events.at(-1);
  return `
    <section class="overview-band">
      <div class="overview-head">
        <div>
          <h2>V3 主脑概览</h2>
          <p>${escapeHtml(report.cycle.summary ?? lastEvent?.summary ?? "当前轮次尚未写入最终总结")}</p>
        </div>
        <span class="badge ${report.verification.ok ? "ok" : "warn"}">${report.verification.ok ? "可复盘" : "需补齐"}</span>
      </div>
      <div class="kpi-grid">
        ${renderMetric("状态", report.cycle.status)}
        ${renderMetric("事件数", report.cycle.eventCount)}
        ${renderMetric("执行链路", report.cycle.hasExecution ? "有" : "无")}
        ${renderMetric("交易标的", report.cycle.symbols.join(", ") || "无")}
        ${renderMetric("最终总结", finalSummary ? `#${finalSummary.sequence}` : "缺失")}
        ${renderMetric("审计结果", report.verification.ok ? "通过" : report.verification.reason ?? "异常")}
      </div>
      ${renderVerificationNotice(report)}
      ${renderV3Gaps(report)}
    </section>
    <div class="v3-board">
      ${renderV3Section("账户与市场事实", report.dataEvents, "还没有账户、持仓、市场或预检数据事件")}
      ${renderV3Section("筛选路径", report.screeningEvents, "还没有记录筛选、扫描或自由分析依据")}
      ${renderV3Section("组合判断", report.portfolioEvents, "还没有记录组合层面的判断或意图")}
      ${renderV3Section("下单与调仓依据", actionBasis, "还没有风险、动作或执行依据")}
      ${renderV3Section("复核与最终总结", reviewEvents, "还没有复核事件或最终总结")}
    </div>
  `;
}

function renderMetric(label: string, value: string | number): string {
  return `
    <div class="metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function renderVerificationNotice(report: CycleReport): string {
  if (report.verification.ok) {
    return `<div class="notice ok-bg">hash 链、payload 和最终总结校验通过，共检查 ${report.verification.checkedEvents} 个事件。</div>`;
  }
  return `
    <div class="notice warn-bg">
      审计未通过：${escapeHtml(report.verification.reason ?? "unknown")}
      ${report.verification.brokenAtEventId ? `，定位事件 ${escapeHtml(report.verification.brokenAtEventId)}` : ""}
    </div>
  `;
}

function renderV3Gaps(report: CycleReport): string {
  const gaps: string[] = [];
  if (!report.summaryEvents.some((event) => event.type === "summary.finalized")) {
    gaps.push("缺少每轮结束必须写入的 summary.finalized");
  }
  if (!report.dataEvents.length) {
    gaps.push("缺少账户、仓位、订单或市场数据记录");
  }
  if (!report.screeningEvents.length) {
    gaps.push("缺少筛选路径或自由分析记录");
  }
  if (!report.portfolioEvents.length) {
    gaps.push("缺少组合层面的决策记录");
  }
  if (!report.actionEvents.length && !report.executionEvents.length) {
    gaps.push("缺少动作、执行或明确放弃动作的记录");
  }
  if (!report.verificationEvents.length && report.cycle.hasExecution) {
    gaps.push("已有执行链路但缺少执行后复核记录");
  }
  if (!gaps.length) {
    return `<div class="notice ok-bg">主脑链路记录完整，可以按分区复盘。</div>`;
  }
  return `
    <div class="gap-list">
      <strong>当前缺口</strong>
      <ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderV3Section(title: string, events: AuditEventRecord[], emptyText: string): string {
  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      ${renderEventCards(events, emptyText)}
    </section>
  `;
}

function renderEventCards(events: AuditEventRecord[], emptyText: string): string {
  if (!events.length) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  return `
    <div class="event-card-list">
      ${events
        .map(
          (event) => `
            <button class="event-card ${event.eventId === state.selectedEventId ? "active" : ""}" data-event-id="${escapeAttr(event.eventId)}">
              <span class="event-card-top">
                <strong>#${event.sequence} ${escapeHtml(event.type)}</strong>
                <span>${escapeHtml(event.phase)}</span>
              </span>
              <span>${escapeHtml(event.summary)}</span>
              <span class="cycle-meta">${escapeHtml(event.symbol ?? "all")} · payload ${escapeHtml(event.payloadHash.slice(0, 12))}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEventButton(event: AuditEventRecord): string {
  return `
    <button class="event-button ${event.eventId === state.selectedEventId ? "active" : ""}" data-event-id="${escapeAttr(event.eventId)}">
      <div class="event-title"><span>#${event.sequence} ${escapeHtml(event.type)}</span><span>${escapeHtml(event.phase)}</span></div>
      <div class="event-summary">${escapeHtml(event.summary)}</div>
      <div class="cycle-meta">${escapeHtml(event.symbol ?? "all")} · ${escapeHtml(event.payloadHash.slice(0, 10))}</div>
    </button>
  `;
}

function renderSelectedEvent(events: AuditEventRecord[]): string {
  const event = events.find((item) => item.eventId === state.selectedEventId);
  if (!event) {
    return "<p>未选择事件</p>";
  }
  return `
    <table>
      <tbody>
        <tr><th>event</th><td>${escapeHtml(event.eventId)}</td></tr>
        <tr><th>type</th><td>${escapeHtml(event.type)}</td></tr>
        <tr><th>phase</th><td>${escapeHtml(event.phase)}</td></tr>
        <tr><th>summary</th><td>${escapeHtml(event.summary)}</td></tr>
        <tr><th>payload hash</th><td>${escapeHtml(event.payloadHash)}</td></tr>
        <tr><th>event hash</th><td>${escapeHtml(event.eventHash)}</td></tr>
      </tbody>
    </table>
    <h3>Raw Payload</h3>
    <pre>${escapeHtml(JSON.stringify(state.selectedPayload, null, 2))}</pre>
  `;
}

function renderEventTable(events: AuditEventRecord[]): string {
  if (!events.length) {
    return "<p>暂无记录</p>";
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>type</th><th>symbol</th><th>summary</th><th>payload</th></tr></thead>
        <tbody>
          ${events
            .map(
              (event) => `
                <tr>
                  <td>${event.sequence}</td>
                  <td>${escapeHtml(event.type)}</td>
                  <td>${escapeHtml(event.symbol ?? "all")}</td>
                  <td>${escapeHtml(event.summary)}</td>
                  <td><button class="link-button" data-event-id="${escapeAttr(event.eventId)}">${escapeHtml(event.payloadHash.slice(0, 12))}</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDiff(events: AuditEventRecord[]): string {
  const options = events
    .map((event) => `<option value="${escapeAttr(event.eventId)}">#${event.sequence} ${escapeHtml(event.type)}</option>`)
    .join("");
  return `
    <div class="form">
      <select id="diff-left">${options}</select>
      <select id="diff-right">${options}</select>
      <button class="primary" id="run-diff">比较 payload</button>
    </div>
    ${
      state.diff
        ? `<p>Changed keys: ${escapeHtml(state.diff.changedKeys.join(", ") || "none")}</p>
           <div class="two-col"><pre>${escapeHtml(JSON.stringify(state.diff.left, null, 2))}</pre><pre>${escapeHtml(JSON.stringify(state.diff.right, null, 2))}</pre></div>`
        : ""
    }
  `;
}

function renderSymbolHistory(): string {
  if (!state.symbolDecisions.length) {
    return "<p>当前轮没有 symbol 决策记录</p>";
  }
  return renderEventTable(
    state.symbolDecisions.map((decision, index) => ({
      eventId: `${decision.cycleId}-${index}`,
      cycleId: decision.cycleId,
      sequence: index + 1,
      timestamp: decision.timestamp,
      type: decision.type,
      phase: decision.phase,
      summary: decision.summary,
      severity: "info",
      symbol: decision.symbol,
      tags: [],
      payloadHash: decision.payloadHash,
      payloadRef: "",
      eventHash: decision.payloadHash
    }))
  );
}

function renderNotes(notes: ReviewNote[]): string {
  return `
    <form class="form" id="note-form">
      <textarea id="note-body" placeholder="记录复盘观察"></textarea>
      <button class="primary" type="submit">保存备注</button>
    </form>
    <div>
      ${notes
        .map(
          (note) => `
            <p><strong>${escapeHtml(note.author)}</strong> ${escapeHtml(note.timestamp)}</p>
            <p>${escapeHtml(note.body)}</p>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEmpty(): string {
  return `<section class="panel"><h2>暂无审计数据</h2><p>先运行 <code>npm run sample</code> 生成示例轮次。</p></section>`;
}

function bindEvents(): void {
  document.querySelector<HTMLInputElement>("#cycle-filter")?.addEventListener("input", (event) => {
    state.filter = (event.target as HTMLInputElement).value;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-cycle-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedCycleId = button.dataset.cycleId;
      state.selectedEventId = undefined;
      state.diff = undefined;
      await loadSelectedCycle();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-event-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedEventId = button.dataset.eventId;
      await loadSelectedPayload();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>("#run-diff")?.addEventListener("click", async () => {
    const left = document.querySelector<HTMLSelectElement>("#diff-left")?.value;
    const right = document.querySelector<HTMLSelectElement>("#diff-right")?.value;
    if (left && right) {
      state.diff = await api(`/api/diff?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`);
      render();
    }
  });
  document.querySelector<HTMLFormElement>("#note-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = document.querySelector<HTMLTextAreaElement>("#note-body")?.value.trim();
    if (!body || !state.selectedCycleId) {
      return;
    }
    await api(`/api/cycles/${encodeURIComponent(state.selectedCycleId)}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "local", body, tags: ["review"] })
    });
    await loadSelectedCycle();
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

function isV3Report(report: CycleReport): boolean {
  const haystack = [
    report.cycle.cycleId,
    report.cycle.summary ?? "",
    ...report.events.flatMap((event) => [event.type, event.phase, event.summary, ...event.tags])
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes("v3");
}

function uniqueEvents(events: AuditEventRecord[]): AuditEventRecord[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.eventId)) {
      return false;
    }
    seen.add(event.eventId);
    return true;
  });
}

loadCycles().catch((error: unknown) => {
  app.innerHTML = `<pre>${escapeHtml(error instanceof Error ? error.stack ?? error.message : String(error))}</pre>`;
});
