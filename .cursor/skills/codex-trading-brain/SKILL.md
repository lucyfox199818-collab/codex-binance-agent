---
name: codex-trading-brain
description: Use when the user explicitly asks Codex itself to start, stop, monitor, or operate the V2.txt crypto futures trading workflow through ccxt-mcp, including optional external crypto-data overlays. This skill must not duplicate V2 strategy rules.
---

# Codex Trading Brain

## Responsibility Boundary

Treat `V2.txt` as the strategy, threshold, risk, and discretionary trading-decision source. This skill owns the operational wrapper: cycle state machine, MCP tool order, batch/incremental data discipline, execution verification, and final cycle summary scaffold.

If this skill and `V2.txt` conflict on strategy thresholds or risk limits, follow `V2.txt`. If they conflict on cycle mechanics, MCP acquisition discipline, or mandatory summary shape, follow this skill. If `V2.txt` is missing or unreadable, stop and do not trade.

## Core Contract

Act as the trading brain. Read `V2.txt`, call MCP tools for account and market data, reason through the current V2 rules, and call MCP tools for execution only when `V2.txt` allows it.

Each cycle MUST run every stage in this exact order. Do not skip a later stage; if an earlier stage is blocked, continue to the final summary with the blocker recorded.

1. Re-read or confirm the current `V2.txt` rules.
2. Discover/load `ccxt-mcp` tools if needed.
3. Read account, positions, regular orders, and conditional/protection orders through `ccxt-mcp`.
4. Manage existing positions first: verify protection, detect drift, and apply V2 exit/adjustment rules before considering new entries.
5. Scan the configured CCXT futures market universe through `ccxt-mcp` using batch and incremental calls where possible.
6. Perform cross-sectional coin selection from the current-cycle payloads.
7. Apply CTA confirmation to decide whether each ranked candidate is tradable.
8. Run risk controls and position sizing for each tradable candidate.
9. If current open positions are below the max-position cap defined in `V2.txt`, open qualifying new symbols in rank order until V2 blocks entries, candidates run out, or the account reaches that cap. Do not open duplicate symbols.
10. Submit entries and synchronized stop-loss/take-profit protection through `ccxt-mcp` only if every V2 gate passes and live trading is explicitly enabled.
11. Re-read execution, position, ordinary-order, and TP/SL state.
12. Emit the mandatory final cycle summary. This output is required for every cycle, including no-trade, blocked, dry-run, error, or timeout cycles.
13. Wait for the configured interval and repeat with dynamic management of all existing positions.

## MCP Data Flow

Use MCP in this order:

1. `ccxt-mcp` account state: config, balances, positions, margin/leverage state, PnL fields returned by the exchange, regular open orders, closed/canceled orders, and conditional/protection orders where the exchange exposes them.
2. `ccxt-mcp` market data: exchange markets, 24h tickers, best bid/ask or order book data, funding/mark data, open interest, and candles.
3. Optional free external MCP overlays: public CoinGecko or other no-paid-plan sources when available and relevant.
4. Codex reasoning: derive the exact filters, rankings, CTA confirmation, sizing, TP/SL, and strategy-specific report fields from `V2.txt`.
5. `ccxt-mcp` execution: place, close, edit, cancel, or modify futures orders only when the V2 plan explicitly allows the action.
6. `ccxt-mcp` account state again: verify post-action account, position, order, and protection state.

For MCP capability names and first-wave scan structure, read `references/v2-operating-procedure.md`.
For optional external data-source policy, including free-only rules and paid-source exclusions, read `references/mcp-data-policy.md`.

## Tool Discipline

Market and account scans must use `ccxt-mcp` tools. Do not replace `ccxt-mcp` calls with ad hoc local shell, Python, REST, web-scraping, or file-generated scanner scripts.

Do not call web search, browser search, or generic web/news lookup tools during a V2 live decision cycle. Complete required `ccxt-mcp` account, order, protection, and market-data reads first. Optional external context may be queried only through already configured free MCP/data-provider tools and only after required `ccxt-mcp` data are complete enough for V2. If no configured free optional source is available, record `optionalDataMissing` or `freeOnlySkipped`; do not start or unblock a live cycle with generic Reuters, CoinDesk, BTC/ETH, Binance futures, volatility, or headline searches.

Temporary Node MCP clients are allowed only as stdio transport adapters to the real `ccxt-mcp` server when native MCP tools are not exposed in the current Codex session. They must launch `ccxt-mcp/dist/index.js` with an explicit absolute `cwd` pointing at the `ccxt-mcp` package directory, call `listTools` before data collection, and continue only if the expected `ccxt_` read tools are present. Never set the MCP server cwd from `process.cwd()` for live-cycle data reads. The wrapper must not import `ccxt`, use `fetch`/REST, scrape web pages, or compute market data from files; it may only call MCP tools and process their returned payloads. Keep a `readOnlyToolAllowlist` and abort before any mutating tool such as `ccxt_create_*`, `ccxt_cancel_*`, `ccxt_edit_*`, `ccxt_set_*`, `ccxt_add_margin`, `ccxt_reduce_margin`, `ccxt_transfer`, or `ccxt_withdraw`. `ccxt_call` may be used only for explicitly reviewed read-only exchange GET methods, and each allowed method name must be listed before the cycle starts.

If a required `ccxt-mcp` market-data, account, or execution capability is unavailable, report the missing capability and return a no-trade/status result. Do not silently fall back to a homemade scanner.

Before any live execution, call `ccxt_get_config` and verify the configured exchange, account credentials, proxy presence when required, and trading gate state. If `CCXT_ENABLE_TRADING` is not true or `CCXT_DRY_RUN` is true, treat execution tools as simulation-only and report the dry-run result instead of claiming a live order was placed.

Every cycle must recompute the eligible pool, long Top 5, short Top 5, and candidate list from the current cycle's MCP payloads. Previous-cycle Top 5 may be used only as a comparison after recomputation, never as an input or cache for the current ranking.

Use incremental data retrieval after the first baseline: keep per-symbol timestamps/cursors for candles, orders, trades, and account events when the tool supports `since` or `limit`. Full-market coverage is still required, but do it with batch calls and cached static metadata instead of re-downloading full historical data each round.

Prefer high-density MCP calls over scattered calls: use all-symbol or multi-symbol tools such as `ccxt_fetch_tickers`, `ccxt_fetch_funding_rates`, `ccxt_fetch_mark_prices`, `ccxt_fetch_open_interests`, `ccxt_fetch_positions`, and order/account batch endpoints when available. Only fan out per symbol after the cross-sectional seed list is narrowed.

Local shell commands are allowed only for repo/config inspection, not live market discovery. If a local Python command is unavoidable for repo inspection, use `python3`; do not assume a `python` alias exists.

## Continuous Operation

Default cadence is one decision cycle every 60 seconds unless the user gives another interval. Continue in the active Codex CLI/session until the user stops it, a newer instruction changes the objective, MCP tools become unavailable, or V2 risk/account state requires stopping.

Do not stop merely because a cycle has no trade. `No trade` is a normal V2 decision.

## Hard Boundaries

- Do not use remembered thresholds when `V2.txt` is available.
- Do not invent market data if an MCP capability is missing.
- Do not silently place orders; produce the V2 trade plan first.
- Do not place orders without stop loss and take profit if V2 requires them.
- Do not continue new entries when account, order, position, or protection state is unclear.
- Do not omit the final cycle summary. A partial cycle still requires a complete summary with missing fields marked as unavailable and the reason.
