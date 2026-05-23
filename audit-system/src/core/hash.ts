import { createHash } from "node:crypto";

import { stableStringify } from "./json.js";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPayload(payload: unknown): string {
  return sha256(stableStringify(payload));
}
