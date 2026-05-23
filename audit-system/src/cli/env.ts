import path from "node:path";

export function auditDataDir(): string {
  return process.env.AUDIT_DATA_DIR
    ? path.resolve(process.env.AUDIT_DATA_DIR)
    : path.resolve(process.cwd(), "..", "state", "audit");
}

export async function readStdin(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim();
}
