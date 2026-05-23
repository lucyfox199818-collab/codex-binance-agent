import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function serveStatic(response: ServerResponse, publicDir: string, pathname: string): boolean {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(publicDir, `.${requested}`);
  if (!filePath.startsWith(path.resolve(publicDir))) {
    return false;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  response.writeHead(200, {
    "content-type": MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
  return true;
}
