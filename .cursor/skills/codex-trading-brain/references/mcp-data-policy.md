# MCP Data Policy

Use this file to decide which external MCP sources to load around a V2 decision cycle. This file is a data-source policy only; it must not define strategy thresholds, risk limits, or output formats.

## Free-Only Live Rule

The V2 live loop runs every 60 seconds. Do not use any optional source in the live loop if it requires a paid plan, paid credits, paid API key, paid OAuth account, or unknown billing. Skip it and record `freeOnlySkipped`.

Paid or unknown-cost data may be used only when the user explicitly asks for offline research and confirms the cost/account requirement.

## Capability Tiers

Required for every live decision cycle:

- `ccxt-mcp`: account balances, positions, regular orders, conditional/protection orders where exposed, exchange risk/account fields, protected execution, and post-action verification.
- `ccxt-mcp`: futures market information, 24h ticker statistics, order book or best bid/ask, funding or mark data, open interest where exposed, and candles for `V2.txt` timeframes.

Required data must come through the configured MCP/data-provider surface. Do not replace a missing required MCP call with an ad hoc local scanner script.

Use high-density `ccxt-mcp` calls whenever the server exposes them. Prefer all-symbol or multi-symbol reads such as `ccxt_fetch_tickers`, `ccxt_fetch_funding_rates`, `ccxt_fetch_mark_prices`, `ccxt_fetch_open_interests`, `ccxt_fetch_positions`, and batch order/protection reads before falling back to per-symbol calls. Fan out per symbol only after the universe has been narrowed to holdings, open orders, and ranked seed candidates.

After the first baseline cycle, live data retrieval is incremental by default. Maintain per-exchange and per-symbol cursors for candles, trades, orders, account events, and any available fills/history. Use `since`, `limit`, exchange cursors, cached market metadata, and last-seen timestamps to fetch only new slices. Do not reload full candle history, full order history, or static market metadata every round unless the exchange reports changed listings, a cursor is lost, or a recovery cycle is explicitly required.

Allowed free optional overlays:

- CoinGecko public MCP: market cap, categories, trending coins, metadata, broader market context, and sector heat. Use cached results and do not call every 60-second cycle unless needed for the seed list.
- Public no-key news or protocol-risk data, only if a verified free MCP/REST source is already configured.

Generic web search, browser search, Reuters/CoinDesk headline lookup, or ad hoc news browsing are not configured optional overlays. Do not use them inside a V2 live decision cycle. If relevant news or protocol-risk context is not available through an already configured free source, record `optionalDataMissing` or `freeOnlySkipped` and continue according to V2 gates.

Research-only or excluded from the 60-second live loop:

- Dune MCP: useful for on-chain flows, DEX activity, whale wallets, smart-money queries, dashboards, and reusable SQL analysis, but skip it in the live loop because automated/API usage may require credits or a paid path.
- DefiLlama: useful for TVL, stablecoins, protocol fundamentals, fees/revenue, bridges, hacks, treasury, and protocol risk context. Use only verified public/free endpoints; do not use paid Pro endpoints or unauthenticated OAuth MCP in the live loop.
- CryptoPanic: useful for news and black-swan filtering only if a free official MCP/REST integration is configured. Do not use paid news APIs in the live loop.
- Santiment / Sentiment MCP: social volume, social dominance, trending words, crowding, and topic momentum are useful, but skip paid or subscription-gated metrics.

Excluded unless explicitly approved for paid/offline research:

- Coinglass, Velo, Laevitas, or similar derivatives analytics when they require paid plans, API keys, or subscription-gated data.

## Decision Authority

External overlays may:

- Veto a candidate when severe news, exploit, liquidity, listing, protocol, or crowding risk is detected.
- Downrank a candidate when market-cap quality, sector context, TVL, social, or on-chain evidence is weak.
- Annotate the V2 report with missing data, conflicts, or contextual risk.

External overlays must not:

- Override `V2.txt` account gates, position gates, CTA confirmation, sizing rules, or protected-order requirements.
- Upgrade a no-trade candidate into a trade.
- Invent missing data or infer facts from stale screenshots, headlines, or memory.
- Block a 60-second cycle merely because optional data is unavailable, unless `V2.txt` explicitly requires that source or the missing source is needed to resolve a severe risk.
- Call a source whose cost, quota, or billing mode is unknown.

## Data Acquisition Placement

Use `v2-operating-procedure.md` for the full cycle order. This policy only constrains how data are acquired inside that order:

1. Account, balance, position, regular-order, conditional/protection-order, leverage/margin, and exchange risk reads happen during preflight and again after any action.
2. The broad futures universe scan uses batch market/ticker/funding/mark/open-interest data and cached static metadata where supported.
3. Candles and other time-series data update incrementally with `since`/`limit` or exchange cursors for active seed symbols.
4. Risk sizing data must include current equity, free/used margin, existing exposure, open-order exposure, leverage, and protection state.
5. Entries and protection are submitted only through `ccxt-mcp`, and execution/protection state is re-read after any action.
6. Free optional overlays are queried only for BTC/ETH market context, the seed list, and current holdings, after required `ccxt-mcp` data are available.
7. If an optional source is unavailable, record `optionalDataMissing` with source name, requested data, and impact.
8. If an optional source requires paid/auth/unknown billing, record `freeOnlySkipped` and do not call it.
9. Continue only if required `ccxt-mcp` data are complete enough for `V2.txt`.

## Cycle Budget

- The target cadence is one full decision cycle every 60 seconds.
- Required `ccxt-mcp` calls run first. If they fail, return a no-trade report and do not call execution tools.
- Dense required reads run before sparse reads. Use batch/all-symbol calls for broad scans and reserve per-symbol calls for holdings, open orders, missing protection checks, and shortlisted candidates.
- Reuse cached `ccxt_load_markets` metadata unless listings, contract status, precision, limits, or symbol availability have changed.
- Keep a visible per-cycle data ledger: source, method, symbol scope, cursor or timestamp, freshness, and whether the data were batch or per-symbol.
- Optional overlays are opportunistic. Give all optional overlays a combined budget of at most 5 seconds per cycle.
- If an optional overlay times out, requires login, returns a rate-limit error, or is not exposed in the current Codex session, skip it and record `optionalDataMissing` or `freeOnlySkipped`.
- Do not retry optional overlays inside the same 60-second cycle.
- Cache optional overlay data across cycles using the freshness rules below.

## Freshness

- `ccxt-mcp` account, order, position, and protection state: current cycle only.
- `ccxt-mcp` broad ticker, funding/mark, and open-interest snapshots: current cycle or recent enough for the active `V2.txt` timeframe; prefer batch refreshes.
- `ccxt-mcp` order book or best bid/ask: current cycle for holdings, open orders, and shortlisted trade candidates; do not require order books for every listed symbol unless a batch endpoint exists and fits the cycle budget.
- `ccxt-mcp` candles and trade/fill history: incremental from stored cursors after the first baseline read; report cursor gaps and use a recovery read only when needed.
- `ccxt-mcp` market metadata: cache across cycles and refresh when listings, contract status, precision, limits, or symbol availability may have changed.
- Eligible pool, long Top 5, short Top 5, exclusions, ranked candidates, and CTA decisions: recompute every cycle from current required data. Do not cache rankings across cycles.
- CoinGecko public MCP: prefer data refreshed within 5-15 minutes; cache across cycles.
- Free public research data: use as nearline context only; cached data is acceptable when its timestamp is reported and it is not used as a sole live execution reason.

## Data Ledger Fields

The final summary defined by `v2-operating-procedure.md` must draw from this per-cycle data ledger:

- Required `ccxt-mcp` calls made, grouped by account/protection, broad market scan, seed-candidate detail, execution, and post-action verification.
- Incremental cursors or timestamps used for candles, trades, orders, fills, and account events; explicitly mark any full-refresh recovery.
- Batch/all-symbol calls used and any per-symbol fallbacks, with reason.
- Current position count, V2 max-position cap, remaining slots under that cap, and whether new symbols were permitted this cycle.
- Risk inputs used for sizing: equity, free/used margin, existing exposure, open-order exposure, leverage/margin mode, and protection status.
- Missing required data, blocked execution gates, or no-trade reasons.

When optional overlays are used, also include:

- Sources queried.
- Data timestamp or freshness.
- Candidate vetoes and downranks.
- Severe-news or protocol-risk findings.
- Missing optional data and whether it affected the final decision.
- `freeOnlySkipped` sources and why they were skipped.
