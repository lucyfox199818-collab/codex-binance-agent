const SECRET_KEYS = new Set([
  "apikey",
  "api_key",
  "secret",
  "password",
  "token",
  "authorization",
  "cookie",
  "proxyurl",
  "proxy_url",
  "signature",
  "listenkey",
  "listen_key",
  "address"
]);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = SECRET_KEYS.has(normalizeKey(key)) ? "[REDACTED]" : redactSecrets(nested);
    }
    return redacted;
  }

  return value;
}

function normalizeKey(key: string): string {
  return key.replace(/[-\s]/g, "_").toLowerCase();
}
