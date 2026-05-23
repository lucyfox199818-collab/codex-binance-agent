# Trading Audit System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local audit system that records every V2 trading cycle as a verifiable event chain, persists SQLite/JSONL/blob data, and provides a separate frontend for detailed review.

**Architecture:** Add a new `audit-system/` TypeScript package separate from `ccxt-mcp/`. The package contains a storage core using Node 22 `node:sqlite`, a JSONL/blob archive, a CLI for recording events from future trading cycles, a read-mostly HTTP API, and a Vite frontend. The system never imports `ccxt` and never exposes trading actions.

**Tech Stack:** Node.js 22, TypeScript, Vitest, Vite, vanilla TypeScript frontend, `node:sqlite`, `node:zlib`, `node:http`.

---

### Task 1: Package Scaffold

**Files:**
- Create: `audit-system/package.json`
- Create: `audit-system/tsconfig.json`
- Create: `audit-system/vite.config.ts`
- Create: `audit-system/index.html`
- Create: `audit-system/src/types/node-sqlite.d.ts`
- Create: `audit-system/src/shared/types.ts`

- [ ] **Step 1: Create package config**

Create an ESM TypeScript package with scripts:

```json
{
  "name": "trading-audit-system",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build:server": "tsc -p tsconfig.json",
    "build:ui": "vite build",
    "build": "npm run build:server && npm run build:ui",
    "start": "node dist/server/index.js",
    "dev": "npm run build:ui && tsx src/server/index.ts",
    "sample": "tsx src/cli/record-sample.ts",
    "audit": "tsx src/cli/audit-cli.ts"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.1.1",
    "vite": "^7.3.3"
  },
  "devDependencies": {
    "@types/node": "^22.15.21",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Use `moduleResolution: "NodeNext"`, output server code to `dist/`, and build UI assets to `dist/public`.

- [ ] **Step 3: Define shared types**

Define `AuditEventType`, `AuditPhase`, `AuditSeverity`, `AuditEventInput`, `AuditEventRecord`, `AuditCycleRecord`, `ReviewNote`, `SymbolDecision`, and `CycleReport` in `src/shared/types.ts`.

### Task 2: Audit Core With TDD

**Files:**
- Create: `audit-system/tests/audit-core.test.ts`
- Create: `audit-system/src/core/json.ts`
- Create: `audit-system/src/core/redact.ts`
- Create: `audit-system/src/core/hash.ts`
- Create: `audit-system/src/core/store.ts`
- Create: `audit-system/src/core/recorder.ts`

- [ ] **Step 1: Write failing tests**

Test that redaction hides secret fields, payload hashes are stable, appending events writes SQLite/JSONL/blob records, and hash chain verification fails after tampering.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd audit-system && npm test -- tests/audit-core.test.ts`
Expected: FAIL because core modules do not exist.

- [ ] **Step 3: Implement core modules**

Implement stable JSON stringify, recursive redaction, SHA-256 helpers, `AuditStore`, and `AuditRecorder`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `cd audit-system && npm test -- tests/audit-core.test.ts`
Expected: PASS.

### Task 3: CLI And Sample Cycle With TDD

**Files:**
- Create: `audit-system/tests/audit-cli.test.ts`
- Create: `audit-system/src/cli/audit-cli.ts`
- Create: `audit-system/src/cli/record-sample.ts`

- [ ] **Step 1: Write failing tests**

Test that `append` accepts JSON stdin and that `record-sample` creates a full cycle containing started, MCP call, candidate, CTA, risk, execution, verification and summary events.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd audit-system && npm test -- tests/audit-cli.test.ts`
Expected: FAIL because CLI files do not exist.

- [ ] **Step 3: Implement CLI**

Implement `append`, `verify`, `sample`, and environment variable `AUDIT_DATA_DIR`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `cd audit-system && npm test -- tests/audit-cli.test.ts`
Expected: PASS.

### Task 4: HTTP API With TDD

**Files:**
- Create: `audit-system/tests/audit-server.test.ts`
- Create: `audit-system/src/server/api.ts`
- Create: `audit-system/src/server/static.ts`
- Create: `audit-system/src/server/index.ts`

- [ ] **Step 1: Write failing tests**

Test API routes: `GET /api/cycles`, `GET /api/cycles/:id`, `GET /api/cycles/:id/events`, `GET /api/events/:id/payload`, `GET /api/symbols/:symbol/decisions`, `GET /api/cycles/:id/report`, `GET /api/cycles/:id/verify`, `GET /api/diff`, and `POST /api/cycles/:id/notes`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `cd audit-system && npm test -- tests/audit-server.test.ts`
Expected: FAIL because server modules do not exist.

- [ ] **Step 3: Implement API**

Implement a local HTTP server with JSON helpers, route parsing, no trading endpoints, and static file serving.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `cd audit-system && npm test -- tests/audit-server.test.ts`
Expected: PASS.

### Task 5: Frontend

**Files:**
- Create: `audit-system/src/ui/main.ts`
- Create: `audit-system/src/ui/styles.css`

- [ ] **Step 1: Build the UI around existing API contracts**

Implement cycle list, timeline, event detail, candidate table, execution/verification panel, payload diff, symbol history, review report, hash verification and notes form.

- [ ] **Step 2: Verify frontend build**

Run: `cd audit-system && npm run build`
Expected: PASS and write `dist/public`.

### Task 6: Trading Brain Integration Docs

**Files:**
- Modify: `.cursor/skills/trading-v2/SKILL.md`
- Modify: `.cursor/skills/trading-v2/references/v2-operating-procedure.md`
- Modify: `.cursor/skills/trading-v2/references/mcp-data-policy.md`
- Modify: `V2.txt`

- [ ] **Step 1: Require audit events in each cycle**

Document that every V2 cycle gets a `cycle_id`, writes audit events for each major stage, and includes audit status in the final summary.

- [ ] **Step 2: Keep safety boundary explicit**

Document that audit CLI may only write local records and must not fetch market data or execute trades.

### Task 7: Final Verification

**Files:**
- Modify: `audit-system/README.md`

- [ ] **Step 1: Document usage**

Document install, sample data generation, server start, UI URL, storage paths, API endpoints and safety boundary.

- [ ] **Step 2: Run full verification**

Run:

```bash
cd audit-system
npm test
npm run typecheck
npm run build
AUDIT_DATA_DIR=/tmp/trading-audit-demo npm run sample
AUDIT_DATA_DIR=/tmp/trading-audit-demo npm start
```

Expected: tests pass, typecheck passes, build succeeds, sample writes SQLite/JSONL/blob files, and server starts locally.
