import path from "node:path";

import { auditDataDir } from "../cli/env.js";
import { createAuditServer } from "./api.js";

const port = Number.parseInt(process.env.AUDIT_PORT ?? "4177", 10);
const host = process.env.AUDIT_HOST ?? "127.0.0.1";
const publicDir = path.resolve(process.cwd(), "dist", "public");
const server = createAuditServer({ dataDir: auditDataDir(), publicDir });

server.listen(port, host, () => {
  console.log(`Trading audit server listening at http://${host}:${port}`);
});
