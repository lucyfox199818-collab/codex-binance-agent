#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/lucyfox199818-collab/ccxt-mcp:0.1.0}"
EXCHANGE_ID="${CCXT_EXCHANGE_ID:-okx}"
DEFAULT_TYPE="${CCXT_DEFAULT_TYPE:-swap}"
SYMBOL="${SYMBOL:-BTC/USDT:USDT}"

output_file="$(mktemp)"
trap 'rm -f "${output_file}"' EXIT

printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"public-mcp-smoke","version":"0.1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ccxt_get_config","arguments":{}}}' \
  "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"ccxt_fetch_ticker\",\"arguments\":{\"symbol\":\"${SYMBOL}\"}}}" \
  | docker run --rm -i \
      -e "CCXT_EXCHANGE_ID=${EXCHANGE_ID}" \
      -e "CCXT_DEFAULT_TYPE=${DEFAULT_TYPE}" \
      -e CCXT_ENABLE_TRADING=false \
      -e CCXT_DRY_RUN=true \
      "${IMAGE}" \
  | tee "${output_file}"

node - "${output_file}" "${EXCHANGE_ID}" "${SYMBOL}" <<'NODE'
const fs = require("node:fs");

const [, , outputPath, expectedExchange, expectedSymbol] = process.argv;
const lines = fs.readFileSync(outputPath, "utf8").trim().split("\n").filter(Boolean);
const messages = lines.map((line) => JSON.parse(line));

function response(id) {
  const message = messages.find((item) => item.id === id);
  if (!message) {
    throw new Error(`Missing JSON-RPC response id=${id}`);
  }
  return message;
}

function toolPayload(id) {
  const message = response(id);
  if (message.result?.isError) {
    const detail = message.result.content?.[0]?.text ?? "unknown MCP tool error";
    throw new Error(`MCP tool id=${id} failed: ${detail}`);
  }

  const text = message.result?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`MCP tool id=${id} returned no text payload`);
  }
  return JSON.parse(text);
}

const initialized = response(1);
if (initialized.result?.serverInfo?.name !== "ccxt-mcp") {
  throw new Error("Unexpected MCP server identity");
}

const config = toolPayload(2);
if (config.exchangeId !== expectedExchange) {
  throw new Error(`Expected exchange ${expectedExchange}, got ${config.exchangeId}`);
}
if (config.enableTrading !== false || config.dryRun !== true) {
  throw new Error("Safety gate check failed: trading must be disabled and dry-run enabled");
}
if (config.hasApiKey !== false || config.hasSecret !== false) {
  throw new Error("Public smoke test unexpectedly received exchange credentials");
}

const ticker = toolPayload(3);
if (ticker.symbol !== expectedSymbol || typeof ticker.last !== "number") {
  throw new Error(`Unexpected ticker payload for ${expectedSymbol}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      server: initialized.result.serverInfo,
      safety: {
        exchangeId: config.exchangeId,
        hasApiKey: config.hasApiKey,
        enableTrading: config.enableTrading,
        dryRun: config.dryRun
      },
      ticker: {
        symbol: ticker.symbol,
        datetime: ticker.datetime,
        last: ticker.last
      }
    },
    null,
    2
  )
);
NODE
