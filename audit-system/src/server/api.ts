import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { AuditStore } from "../core/store.js";
import { serveStatic } from "./static.js";
import type { AuditCycleRecord, AuditSeverity, EventQuery } from "../shared/types.js";

export interface AuditServerOptions {
  dataDir: string;
  publicDir?: string;
}

export function createAuditServer(options: AuditServerOptions): Server {
  const store = new AuditStore({ dataDir: options.dataDir });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
        await handleApiRequest(store, request, response);
        return;
      }
      if (options.publicDir && serveStatic(response, options.publicDir, url.pathname)) {
        return;
      }
      writeJson(response, 404, { error: "not found" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  server.on("close", () => {
    store.close();
  });
  return server;
}

async function handleApiRequest(
  store: AuditStore,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/api/cycles") {
    writeJson(response, 200, url.search ? store.listCyclesPage(parseCycleQuery(url)) : store.listCycles());
    return;
  }

  const cycleEventsMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)\/events$/);
  if (request.method === "GET" && cycleEventsMatch) {
    const cycleId = decodeURIComponent(cycleEventsMatch[1]!);
    writeJson(response, 200, url.search ? store.listEventsPage(cycleId, parseEventQuery(url)) : store.listEvents(cycleId));
    return;
  }

  const cycleOverviewMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)\/overview$/);
  if (request.method === "GET" && cycleOverviewMatch) {
    writeJson(response, 200, store.getCycleOverview(decodeURIComponent(cycleOverviewMatch[1]!)));
    return;
  }

  const cycleReportMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)\/report$/);
  if (request.method === "GET" && cycleReportMatch) {
    writeJson(response, 200, store.getCycleReport(decodeURIComponent(cycleReportMatch[1]!)));
    return;
  }

  const cycleVerifyMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)\/verify$/);
  if (request.method === "GET" && cycleVerifyMatch) {
    writeJson(response, 200, store.verifyCycle(decodeURIComponent(cycleVerifyMatch[1]!)));
    return;
  }

  const notesMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)\/notes$/);
  if (request.method === "POST" && notesMatch) {
    const body = await readJsonBody(request);
    const note = store.addReviewNote(decodeURIComponent(notesMatch[1]!), stringField(body, "body"), {
      author: optionalStringField(body, "author"),
      tags: stringArrayField(body, "tags")
    });
    writeJson(response, 201, note);
    return;
  }

  const cycleMatch = url.pathname.match(/^\/api\/cycles\/([^/]+)$/);
  if (request.method === "GET" && cycleMatch) {
    const cycle = store.getCycle(decodeURIComponent(cycleMatch[1]!));
    if (!cycle) {
      writeJson(response, 404, { error: "cycle not found" });
      return;
    }
    writeJson(response, 200, cycle);
    return;
  }

  const payloadMatch = url.pathname.match(/^\/api\/events\/([^/]+)\/payload$/);
  if (request.method === "GET" && payloadMatch) {
    writeJson(response, 200, store.getPayload(decodeURIComponent(payloadMatch[1]!)));
    return;
  }

  const symbolMatch = url.pathname.match(/^\/api\/symbols\/(.+)\/decisions$/);
  if (request.method === "GET" && symbolMatch) {
    writeJson(response, 200, store.listSymbolDecisions(decodeURIComponent(symbolMatch[1]!)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/diff") {
    const left = url.searchParams.get("left");
    const right = url.searchParams.get("right");
    if (!left || !right) {
      writeJson(response, 400, { error: "left and right query params are required" });
      return;
    }
    writeJson(response, 200, store.diffPayloads(left, right));
    return;
  }

  writeJson(response, 404, { error: "not found" });
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "http://127.0.0.1"
  });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  request.setEncoding("utf8");
  for await (const chunk of request) {
    raw += chunk;
  }
  const parsed = JSON.parse(raw || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON body must be an object");
  }
  return parsed as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array`);
  }
  return value.filter((item): item is string => typeof item === "string");
}

function parseCycleQuery(url: URL): {
  q?: string;
  status?: AuditCycleRecord["status"];
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
} {
  return stripUndefined({
    q: optionalParam(url, "q"),
    status: parseCycleStatus(optionalParam(url, "status")),
    symbol: optionalParam(url, "symbol"),
    from: optionalParam(url, "from"),
    to: optionalParam(url, "to"),
    limit: numberParam(url, "limit"),
    cursor: optionalParam(url, "cursor")
  });
}

function parseEventQuery(url: URL): EventQuery {
  return stripUndefined({
    q: optionalParam(url, "q"),
    phases: phasesParam(url),
    type: optionalParam(url, "type"),
    symbol: optionalParam(url, "symbol"),
    severity: parseSeverity(optionalParam(url, "severity")),
    limit: numberParam(url, "limit"),
    cursor: optionalParam(url, "cursor")
  });
}

function optionalParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

function numberParam(url: URL, key: string): number | undefined {
  const value = optionalParam(url, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function phasesParam(url: URL): EventQuery["phases"] | undefined {
  const values = url.searchParams
    .getAll("phase")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? (values as EventQuery["phases"]) : undefined;
}

function parseCycleStatus(value: string | undefined): AuditCycleRecord["status"] | undefined {
  return value === "running" || value === "completed" || value === "error" ? value : undefined;
}

function parseSeverity(value: string | undefined): AuditSeverity | undefined {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}
