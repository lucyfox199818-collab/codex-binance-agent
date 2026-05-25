# Audit UI Scale Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the audit frontend usable with many cycles and many events without restarting or changing any running service.

**Architecture:** Keep the existing Node/Vite/vanilla TypeScript stack. Add paged/filterable read APIs while preserving old array responses for callers without query parameters, then refactor the frontend into a workbench with cycle navigation, tabs, paged event views, lazy payload/report loading, and lightweight windowing helpers.

**Tech Stack:** Node.js 22, TypeScript, Vitest, Vite, vanilla TypeScript, SQLite via `node:sqlite`.

---

### Task 1: API Pagination And Filtering

**Files:**
- Modify: `audit-system/src/shared/types.ts`
- Modify: `audit-system/src/core/store.ts`
- Modify: `audit-system/src/server/api.ts`
- Modify: `audit-system/tests/audit-server.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that create several cycles/events, then verify:
- `GET /api/cycles?limit=2` returns `{ items, nextCursor, total }`.
- `GET /api/cycles?q=ETH&status=completed` filters by symbol/text/status.
- `GET /api/cycles/:id/events?phase=analysis&limit=1` returns a paged event response.
- Existing `GET /api/cycles` and `GET /api/cycles/:id/events` still return arrays.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd audit-system
npm test -- tests/audit-server.test.ts
```

Expected: FAIL because paged query responses are not implemented yet.

- [ ] **Step 3: Implement data/API support**

Add `PagedResult<T>`, `CycleQuery`, `EventQuery`, and `CycleOverview` types. Implement store methods for paged cycles/events and an overview endpoint. Preserve legacy array behavior when no query string is provided.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd audit-system
npm test -- tests/audit-server.test.ts
```

Expected: PASS.

### Task 2: UI State Helpers

**Files:**
- Create: `audit-system/src/ui/workbench.ts`
- Create: `audit-system/tests/audit-ui.test.ts`

- [ ] **Step 1: Write failing tests**

Test pure helpers for:
- Tab-to-phase query mapping.
- Cursor page stack navigation.
- Fixed-height visible window calculation.
- Paged response normalization that accepts both legacy arrays and `{ items }`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd audit-system
npm test -- tests/audit-ui.test.ts
```

Expected: FAIL because `workbench.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Implement small pure functions used by the UI renderer. Keep helpers DOM-free so they run in Vitest without jsdom.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd audit-system
npm test -- tests/audit-ui.test.ts
```

Expected: PASS.

### Task 3: Workbench Frontend

**Files:**
- Modify: `audit-system/src/ui/main.ts`
- Modify: `audit-system/src/ui/styles.css`

- [ ] **Step 1: Refactor render flow**

Replace the one-page report stack with:
- left paged cycle navigator,
- sticky cycle overview,
- tabbed workspace,
- right event detail drawer.

- [ ] **Step 2: Add lazy loading**

Load event payload only when the detail payload button is clicked. Load full report JSON only when the report tab button is clicked. Keep diff payload loading behind the compare button.

- [ ] **Step 3: Add pagination/windowing**

Use the paged events API for each tab and render a bounded visible window for dense cycle/event lists. Provide previous/next controls with stable state.

- [ ] **Step 4: Verify build**

Run:

```bash
cd audit-system
npm run typecheck
npm run build
```

Expected: both commands exit 0.

### Task 4: Large Data Fixture And Final Verification

**Files:**
- Create: `audit-system/src/cli/record-large-sample.ts`
- Modify: `audit-system/package.json`
- Modify: `audit-system/README.md`

- [ ] **Step 1: Add fixture generator**

Add `npm run sample:large` to create many cycles/events under `AUDIT_DATA_DIR` without calling exchanges or MCP.

- [ ] **Step 2: Document usage**

Document pagination, lazy loading, large sample generation, and the no-trading/no-restart boundary.

- [ ] **Step 3: Full verification**

Run:

```bash
cd audit-system
npm test
npm run typecheck
npm run build
AUDIT_DATA_DIR=/tmp/trading-audit-large npm run sample:large
```

Expected: tests pass, typecheck passes, build succeeds, and the large fixture writes local audit data only. Do not run `npm start` or restart any service.
