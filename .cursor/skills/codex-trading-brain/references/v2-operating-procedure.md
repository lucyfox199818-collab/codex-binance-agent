# V2 MCP Operating Notes

This file intentionally avoids duplicating `V2.txt`. Use it only as a tool-operation map. Strategy thresholds, exclusions, risk limits, CTA rules, and strategy-specific report content must be read from `V2.txt` at runtime. The cycle order, MCP acquisition discipline, execution verification, and final summary scaffold live here.

## Required MCP Capabilities

Use tool discovery when tools are not already loaded.

`ccxt-mcp` account and execution capabilities:

- Read balances, positions, leverage/margin state, regular orders, conditional/protection orders when exposed by the exchange, and my trades.
- Place futures orders with the parameters required by `V2.txt`.
- Create or maintain stop loss / take profit / trigger / trailing / reduce-only protection when `V2.txt` requires it and the exchange supports the relevant CCXT method.
- Close, edit, cancel, or replace futures orders only when V2 risk handling requires it.

`ccxt-mcp` market-data capabilities:

- Futures exchange markets.
- 24h ticker statistics.
- Best bid/ask or order book data.
- Funding, premium, mark-price, and open-interest data where supported.
- Klines/candles for the timeframes required by `V2.txt`.

If a required capability is missing, do not fake the step. Report the missing capability and stop live execution.

Optional external MCP overlays are governed by `mcp-data-policy.md`. They are not required live-execution capabilities unless `V2.txt` explicitly requires them.

Do not use web search or browser lookup to satisfy optional overlay curiosity inside the live cycle. Missing optional context is recorded in the data ledger; it must not trigger generic web/news searches before account, order, protection, and required market-data preflight.

## Mandatory Cycle Shape

Every cycle must complete this state machine in order:

1. Account/order/protection preflight: `ccxt_get_config`, balances, positions, ordinary orders, conditional/protection orders, and any recent fills required to understand current exposure.
2. Existing-position dynamic management: verify SL/TP, handle exits/adjustments required by `V2.txt`, and block new entries if protection or exposure is unclear.
3. Full-market coverage: refresh the configured futures universe and current broad market payloads.
4. Cross-sectional selection: recompute eligible pool, long Top 5, short Top 5, exclusions, and ranked candidates from current-cycle data.
5. CTA decision: decide candidate tradability from `V2.txt`; CTA failure is a no-trade reason, not a skipped stage.
6. Risk sizing: compute per-candidate size, leverage, margin impact, max-position gate, account gate, and RR/protection validity.
7. Execution and protection: open qualifying new symbols only while current open positions are below the max-position cap defined in `V2.txt`, then place or verify synchronized stop loss and take profit.
8. Post-action verification: re-read account, position, ordinary orders, and protection orders.
9. Final summary: output the complete summary contract below.

If a stage cannot run because data or tools are unavailable, continue to stage 9 and mark the exact blocker. Do not silently stop before the summary.

## First-Wave Market Scan Shape

Use cheap `ccxt-mcp` calls before candle-heavy analysis. Keep full-market coverage, but make each cycle incremental after the first baseline:

1. Call `ccxt_load_markets`.
2. Call all-symbol or multi-symbol batch tools where supported: `ccxt_fetch_tickers`, `ccxt_fetch_funding_rates`, `ccxt_fetch_mark_prices`, and `ccxt_fetch_open_interests`.
3. Use cached static market metadata from the prior cycle unless symbols/listing state changed.
4. Pull best bid/ask or order book data only for narrowed seed symbols when all-symbol book data is unavailable.
5. Pull candles incrementally with `since`/`limit` for seed symbols only. Do not re-download full candle history every round.
6. Build an eligible universe using only the rules currently present in `V2.txt`.
7. Build a smaller seed list from relative strength, relative weakness, and liquidity leaders as requested by `V2.txt`.
8. Let Codex compute V2 indicators and produce long Top 5, short Top 5, exclusions, and ranked candidates according to `V2.txt`.

Do not hard-code numeric thresholds here. If `V2.txt` changes a threshold, the next cycle must follow the new text.

Do not implement this scan by creating or running a local scanning script. The scan input must come from MCP market-data calls. Codex may calculate rankings from already-returned MCP payloads in its reasoning, but it must not substitute local Python, shell, REST, or scraping code for missing MCP data.

If native MCP tools are unavailable and a temporary Node MCP client wrapper is used, it is only a transport adapter to `ccxt-mcp`; it is not a market-data source. Configure the server with the absolute package path, for example `cwd: "/home/adon/codes/codex-binance-agent/ccxt-mcp"` and `args: ["/home/adon/codes/codex-binance-agent/ccxt-mcp/dist/index.js"]`. Never set the MCP server cwd from `process.cwd()` for live-cycle reads. Before any data call, run a handshake with `listTools`, verify that required read tools such as `ccxt_get_config`, `ccxt_fetch_balance`, `ccxt_fetch_positions`, `ccxt_fetch_open_orders`, `ccxt_load_markets`, `ccxt_fetch_tickers`, `ccxt_fetch_funding_rates`, and `ccxt_fetch_ohlcv` are present, and enforce a `readOnlyToolAllowlist` that rejects mutating `ccxt_create_*`, `ccxt_cancel_*`, `ccxt_edit_*`, `ccxt_set_*`, margin, transfer, and withdraw tools. `ccxt_call` may be used only for explicitly reviewed read-only exchange GET methods, such as Binance open-algo-order reads, and each allowed raw method must be named in the cycle ledger before it is called.

Do not reuse previous Top 5 rankings as the current cycle's result. If a report compares with the previous cycle, write it as "this cycle was recomputed from current MCP data; overlap with previous Top 5: ...". Avoid wording such as "延续上一轮 Top5" unless it is explicitly framed as post-recompute overlap.

## Execution Shape

Before any live order MCP call:

1. Produce the complete trade plan required by `V2.txt`.
2. Check that account, positions, ordinary orders, and conditional orders were read successfully.
3. Check that existing-position handling is complete.
4. Check that the order payload maps to the selected `ccxt-mcp` execution tool.
5. Check that stop loss and take profit are included when required by `V2.txt`.
6. Check the max-position gate from `V2.txt`: if current open positions are already at or above that cap, do not open new entries. If open positions are below the cap and V2 permits entries, evaluate ranked candidates in order and allow new qualifying symbols until reaching the cap or exhausting candidates.

Prefer one protected order tool when the exchange supports it, such as `ccxt_create_order_with_take_profit_and_stop_loss`. Otherwise place the entry and protection using the explicit conditional-order tools that the exchange exposes, such as `ccxt_create_stop_loss_order`, `ccxt_create_take_profit_order`, `ccxt_create_trigger_order`, `ccxt_create_stop_order`, or `ccxt_create_trailing_amount_order`.

After any execution MCP call:

1. Record the backend response and order id if present.
2. Re-read account snapshot.
3. Verify position state.
4. Verify stop-loss and take-profit protection.
5. If post-trade protection is missing or unclear, stop new entries and handle risk according to `V2.txt`.

## Mandatory Final Summary

Every cycle must end with a complete summary. Do not omit it for no-trade, blocked, dry-run, partial-data, or error cycles. Use this shape and mark unavailable fields explicitly:

- Cycle: timestamp, cadence, V2 source path/status, exchange, live/dry-run state.
- Data acquisition: account, positions, ordinary orders, conditional/protection orders, market batch calls, incremental cursors used, missing data, and rate-limit/API issues.
- Account and exposure: equity/balance fields available, current open position count, remaining slots to the V2 max-position cap, margin/leverage state, and existing-position management actions.
- Market scan: full-universe size, eligible count, exclusions, seed list size, long Top 5, short Top 5, and whether rankings were recomputed from current-cycle data.
- CTA and candidates: each ranked candidate considered, CTA pass/fail, veto/downrank context, and exact no-trade reason when rejected.
- Risk and sizing: per-candidate risk, stop distance, target, RR, size, leverage/margin impact, and position-cap decision.
- Execution: live/dry-run action, entry orders, protection orders, order ids/responses, failed execution calls, and whether SL/TP were synchronized.
- Post-action verification: final positions, ordinary orders, conditional/protection orders, unresolved risks, and whether new entries are allowed next cycle.
- Next cycle: next run time, cursors/timestamps to carry forward for incremental fetching, and explicit stop reason if the loop should stop.

## Status Reporting

For status requests, summarize the current cycle without restating all V2 rules:

- Account preflight result.
- Existing-position review.
- New-entry eligibility: allowed, blocked by hard gate, or existing-position-only management, with the exact reason.
- Market scan status and candidate counts.
- Long/short Top 5 if available, marked as recomputed from this cycle's MCP payload.
- Previous-cycle overlap only as a comparison field, not as a source of the ranking.
- Final candidate or no-trade reason. If no new entry is opened, distinguish hard-gate block, no candidate, CTA rejection, poor risk/reward, weak market environment, or sufficient existing exposure.
- Exact blockers from V2 gates.
- Any MCP execution result.
- Post-action protection status.
- Next cycle timing or stop reason.
