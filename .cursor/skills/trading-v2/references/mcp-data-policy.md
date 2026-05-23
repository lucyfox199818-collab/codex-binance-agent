# MCP 数据政策

用本文件决定在 V2 决策轮次前后加载哪些外部 MCP 来源。本文件只是数据源政策，不定义策略阈值、风控限制或输出格式。

## 实盘免费优先规则

V2 实盘循环默认每 60 秒运行一次。如果某个可选来源需要付费计划、付费额度、付费 API key、付费 OAuth 账户或计费模式不明，不得在实盘循环中使用。跳过它并记录 `freeOnlySkipped`。

付费或成本未知的数据只允许在用户明确要求离线研究并确认成本/账户要求后使用。

## 能力分层

每个实盘决策轮次必需：

- `ccxt-mcp`：account balances、positions、合约普通未成交委托、交易所暴露的 conditional/protection orders、exchange risk/account 字段、受保护执行和动作后复核。
- `ccxt-mcp`：合约市场信息、24h ticker statistics、order book 或买一卖一、funding 或 mark 数据、支持时的 open interest，以及 `V2.txt` 需要的 candles。

必需数据必须来自配置好的 MCP/数据提供工具。不得用临时本地扫描脚本替代缺失的必需 MCP 调用。

优先使用高密度 `ccxt-mcp` 调用。server 暴露时，先使用全 symbol 或多 symbol 读取，例如 `ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices`、`ccxt_fetch_open_interests`、`ccxt_fetch_positions` 和批量订单/保护读取，再按需退回 per-symbol 调用。只有在 universe 缩窄到持仓、未成交委托和 V2 seed candidates 后，才按 symbol 扇出。

第一轮基线后，实盘数据默认增量读取。为每个 exchange 和 symbol 维护 candles、trades、orders、account events 和可用 fills/history 的 cursor。使用 `since`、`limit`、exchange cursors、缓存 market metadata 和 last-seen timestamps 只读取新增片段。除非交易所报告 listing 变化、cursor 丢失或明确需要恢复轮次，否则不得每轮重载完整 K 线历史、完整订单历史或静态 market metadata。

允许的免费可选覆盖：

- CoinGecko public MCP：market cap、categories、trending coins、metadata、更广泛市场背景和 sector heat。使用缓存结果，除非 V2 seed list 需要，否则不要每 60 秒调用。
- 公共无 key 新闻或协议风险数据，但前提是已经配置了验证为免费的 MCP/REST 来源。

通用 web search、browser search、Reuters/CoinDesk headline lookup 或临时新闻浏览不是已配置的可选覆盖。不得在 V2 实盘决策轮次中使用。如果相关新闻或协议风险背景无法通过已配置免费来源获得，记录 `optionalDataMissing` 或 `freeOnlySkipped`，并按 V2 边界继续。

只用于研究或排除在 60 秒实盘循环外：

- Dune MCP：可用于链上流、DEX 活动、whale wallets、smart-money 查询、dashboard 和可复用 SQL 分析，但自动/API 用法可能需要额度或付费路径，因此实盘循环中跳过。
- DefiLlama：可用于 TVL、stablecoins、protocol fundamentals、fees/revenue、bridges、hacks、treasury 和 protocol risk context。只使用验证为公开/免费的端点；不得在实盘循环中使用付费 Pro endpoints 或未认证 OAuth MCP。
- CryptoPanic：只有已配置免费官方 MCP/REST 集成时，才可用于新闻和黑天鹅过滤。不得在实盘循环中使用付费新闻 API。
- Santiment / Sentiment MCP：social volume、social dominance、trending words、crowding 和 topic momentum 有用，但跳过付费或订阅门槛指标。

除非用户明确批准付费/离线研究，否则排除：

- Coinglass、Velo、Laevitas 或类似 derivatives analytics，如果它们需要付费计划、API keys 或订阅门槛数据。

## 决策权限

外部覆盖可以：

- 在发现严重新闻、exploit、流动性、listing、协议或 crowding 风险时否决候选。
- 当 market-cap quality、sector context、TVL、social 或 on-chain 证据弱时下调候选。
- 在 V2 最终报告中标注缺失数据、冲突或背景风险。

外部覆盖不得：

- 覆盖 `V2.txt` 的账户可验证性、持仓约束、仓位规则或保护要求。
- 把不交易候选升级成交易。
- 编造缺失数据，或从过期截图、新闻标题或记忆推断事实。
- 仅因可选数据不可用就阻塞 60 秒轮次，除非 `V2.txt` 明确要求该来源，或该缺失来源是解决严重风险所必需的。
- 调用成本、quota 或计费模式未知的来源。

## 数据获取位置

完整轮次顺序见 `v2-operating-procedure.md`。本政策只约束在该顺序中如何取数：

1. Account、balance、position、合约普通未成交委托、conditional/protection-order、leverage/margin 和 exchange risk 读取发生在预检阶段，并在任何动作后再次读取。
2. broad futures universe 扫描使用批量 market/ticker/funding/mark/open-interest 数据，以及支持时的缓存静态 metadata。
3. Candles 和其他 time-series 数据对 V2 active seed symbols 使用 `since`/`limit` 或 exchange cursors 增量更新。
4. 风险仓位数据必须包括 current equity、free/used margin、existing exposure、open-order exposure、leverage 和 protection state。
5. 入场和保护只能通过 `ccxt-mcp` 提交，并在任何动作后重新读取 execution/protection state。
6. 免费可选覆盖只在必需 `ccxt-mcp` 数据可用后，为 BTC/ETH 市场背景、V2 seed list 和当前持仓查询。
7. 如果可选来源不可用，记录 `optionalDataMissing`，包含 source name、requested data 和 impact。
8. 如果可选来源需要付费/auth/未知计费，记录 `freeOnlySkipped` 且不得调用。
9. 只有必需 `ccxt-mcp` 数据足够完成 `V2.txt` 判断时，才继续。

## 轮次预算

- 目标节奏是每 60 秒完成一个决策轮次。
- 必需 `ccxt-mcp` 调用优先运行。如果失败，返回阻塞/状态报告，不得调用执行工具。
- 密集必需读取先于稀疏读取。宽扫描使用批量/全 symbol 调用，per-symbol 调用只保留给持仓、未成交委托、缺失保护检查和 V2 shortlisted candidates。
- 除非 listing、contract status、precision、limits 或 symbol availability 可能变化，否则复用缓存的 `ccxt_load_markets` metadata。
- 保持可见的每轮数据台账：source、method、symbol scope、cursor 或 timestamp、freshness，以及数据是 batch 还是 per-symbol。
- 可选覆盖是机会性补充。所有可选覆盖总预算最多 5 秒/轮。
- 如果可选覆盖 timeout、需要登录、返回 rate-limit error，或当前 Codex 会话未暴露该工具，跳过并记录 `optionalDataMissing` 或 `freeOnlySkipped`。
- 不要在同一 60 秒轮次中重试可选覆盖。
- 按下方 freshness 规则跨轮缓存可选覆盖数据。

## 新鲜度

- `ccxt-mcp` account、order、position 和 protection state：只能使用当前轮。
- `ccxt-mcp` broad ticker、funding/mark 和 open-interest snapshots：当前轮，或对 `V2.txt` 选择的时间周期而言足够新；优先批量刷新。
- `ccxt-mcp` order book 或买一卖一：用于持仓、未成交委托和 V2 shortlisted trade candidates 时必须为当前轮；除非存在全量 order book 批量端点且符合轮次预算，否则不要求每个 listed symbol 都读取 order book。
- `ccxt-mcp` candles 和 trade/fill history：第一轮基线后从保存的 cursors 增量读取；报告 cursor gaps，只有需要时才使用恢复读取。
- `ccxt-mcp` market metadata：跨轮缓存，并在 listings、contract status、precision、limits 或 symbol availability 可能变化时刷新。
- V2 的 eligible pool、long Top 5、short Top 5、exclusions、ranked candidates 和 CTA decisions 每轮都从当前必需数据重新计算。不得缓存上一轮结论作为本轮依据。
- CoinGecko public MCP：优先使用 5-15 分钟内刷新的数据；可跨轮缓存。
- 免费公共研究数据：只作为 nearline context；缓存数据可以使用，但必须报告 timestamp，且不得作为唯一实盘执行理由。

## 数据台账字段

`v2-operating-procedure.md` 定义的最终总结必须从这个每轮数据台账提取。启用 `audit-system` 时，同一批字段必须落盘到 SQLite、JSONL 和 payload blob；如果审计写入失败，最终总结必须列出失败阶段和原因。

- 必需 `ccxt-mcp` 调用，按 account/protection、broad market scan、seed-candidate detail、execution 和 post-action verification 分组。
- Candles、trades、orders、fills 和 account events 使用的 incremental cursors 或 timestamps；明确标记任何 full-refresh recovery。
- 使用过的 batch/all-symbol 调用，以及任何 per-symbol fallback 和原因。
- 当前持仓数、`V2.txt` 最大持仓上限、剩余名额，以及本轮是否允许新 symbol。
- 仓位计算使用的风险输入：equity、free/used margin、existing exposure、open-order exposure、leverage/margin mode 和 protection status。
- 缺失的必需数据、被阻塞的执行闸门或不交易原因。
- 审计字段：`cycle_id`、event sequence、event type、phase、summary、payload hash、previous hash、event hash、payload blob path 和 hash chain verification 结果。

使用可选覆盖时，还必须包含：

- 查询过的 sources。
- 数据 timestamp 或 freshness。
- Candidate vetoes 和 downranks。
- Severe-news 或 protocol-risk findings。
- 缺失的可选数据，以及是否影响最终决策。
- `freeOnlySkipped` sources 以及跳过原因。
