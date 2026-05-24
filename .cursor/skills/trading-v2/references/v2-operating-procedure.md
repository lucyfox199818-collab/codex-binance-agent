# V2 MCP 运行说明

本文件刻意不重复 `V2.txt`。它只作为工具运行地图。策略阈值、排除条件、风控限制、CTA 规则和策略类报告内容必须在运行时读取 `V2.txt`。循环顺序、MCP 取数纪律、执行复核和最终总结框架由本文件定义。

## 必需 MCP 能力

工具未预先加载时，先做工具发现。

`ccxt-mcp` 账户和执行能力：

- 读取 balance、positions、leverage/margin 状态、合约普通未成交委托、交易所暴露的条件/保护单，以及 my trades。
- 按 `V2.txt` 要求的参数提交合约订单。
- 当 `V2.txt` 要求且交易所支持相关 CCXT 方法时，创建或维护 stop loss / take profit / trigger / trailing / reduce-only 保护。
- 仅当 V2 风控处理需要时，才平仓、改单、撤单或替换合约订单。

`ccxt-mcp` 行情能力：

- 合约交易所 markets。
- 24h ticker statistics。
- 买一卖一或 order book 数据。
- 支持时读取 funding、premium、mark-price 和 open-interest 数据。
- `V2.txt` 所需时间周期的 K 线/candles。

如果缺少必需能力，不得伪造步骤。报告缺失能力并停止真实执行。

可选外部 MCP 覆盖由 `mcp-data-policy.md` 管理。除非 `V2.txt` 明确要求，否则它们不是实盘执行的必需能力。

不要在实盘轮次里用 web search 或 browser lookup 满足可选背景好奇心。缺失的可选背景只记录在数据台账中；它不得在账户、订单、保护和必需行情预检前触发通用网页/新闻搜索。

## 强制轮次结构

每一轮都必须按顺序完成这个状态机：

1. 审计初始化：生成 `cycle_id`，通过 `audit-system` 写入 `cycle.started`；如果审计不可用，记录缺口并继续轮次。
2. 账户/订单/保护预检：`ccxt_get_config`、balance、positions、合约普通未成交委托、条件/保护单，以及理解当前敞口所需的近期成交；每个 MCP 调用写 `mcp.call`。
3. 持仓/订单/保护单对账：以 positions 和 balance positions 作为持仓事实来源；把条件/保护单按 symbol、positionSide、方向和数量匹配到已有持仓。无对应持仓的条件/保护单必须标记为孤立保护单，先取消或按 V2 风控处理；复核清零前只限制受影响的 symbol/side，或在影响总敞口时限制新增执行。
4. 已有持仓动态管理：验证 SL/TP，按 `V2.txt` 处理必需退出/调整；当保护或敞口不清楚时，只限制受影响的 symbol/side，或在无法确认总仓位约束时暂停真实执行。
5. 全市场覆盖：刷新配置好的合约市场池和当前 broad market payload，并写 `market.snapshot`。
6. 截面选择：用当前轮数据重新计算 eligible pool、long Top 5、short Top 5、排除项和排序候选，并写 `candidate.ranked` / `candidate.filtered`。
7. CTA 决策：按 `V2.txt` 判断候选是否可交易；CTA 失败是不交易原因，不是跳过阶段；每个候选写 `cta.decided`。
8. 风险仓位：计算每个候选的 size、leverage、margin impact、最大持仓约束、账户可用性、RR 和保护有效性，并写 `risk.sized`。
9. 执行和保护：只要当前持仓数低于 `V2.txt` 最大持仓上限，按排名顺序开符合 CTA 和仓位约束的新 symbol，直到达到上限或候选用完；提交前写 `execution.planned`，dry-run 写 `order.dry_run`，真实响应写 `order.submitted`。
10. 动作后复核：重新读取账户、持仓、合约普通未成交委托和保护单，并写 `post.verify`。
11. 最终总结：输出下方完整总结契约，并写 `summary.finalized`。

如果某个阶段因数据或工具不可用而无法运行，继续到第 9 阶段并标记明确阻塞原因。不得在总结前静默停止。

## 第一波市场扫描结构

先使用便宜的 `ccxt-mcp` 调用，再做 K 线密集分析。保持全市场覆盖，但第一轮基线后每轮改用增量方式：

1. 调用 `ccxt_load_markets`。
2. 支持时调用全 symbol 或多 symbol 批量工具：`ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices` 和 `ccxt_fetch_open_interests`。
3. 除非 symbol/listing 状态变化，否则复用上一轮缓存的静态 market metadata。
4. 当没有全 symbol order book 数据时，只对缩窄后的 seed symbols 拉取买一卖一或 order book。
5. 只对 seed symbols 用 `since`/`limit` 增量拉 candles。不得每轮重新下载完整 K 线历史。
6. 只使用当前 `V2.txt` 中的规则构建 eligible universe。
7. 按 `V2.txt` 要求，用相对强势、相对弱势和流动性领先者构建更小的 seed list。
8. 由 Codex 按 `V2.txt` 从 MCP payload 计算 V2 指标，并输出 long Top 5、short Top 5、排除项和排序候选。

不要在这里硬编码数字阈值。如果 `V2.txt` 修改阈值，下一轮必须遵循新文本。

不得通过创建或运行本地扫描脚本实现这个扫描。扫描输入必须来自 MCP 行情调用。Codex 可以在推理中计算已经返回的 MCP payload 排名，但不得用本地 Python、shell、REST 或抓取代码替代缺失的 MCP 数据。

如果原生 MCP 工具不可用并使用临时 Node MCP client wrapper，它只能作为 `ccxt-mcp` 的传输适配器，不能作为行情源。server 必须用绝对 package path 配置，例如 `cwd: "/home/adon/codes/codex-binance-agent/ccxt-mcp"` 和 `args: ["/home/adon/codes/codex-binance-agent/ccxt-mcp/dist/index.js"]`。实盘读取时不得从 `process.cwd()` 设置 MCP server cwd。任何数据调用前，先用 `listTools` 握手，确认必需只读工具存在，例如 `ccxt_get_config`、`ccxt_fetch_balance`、`ccxt_fetch_positions`、`ccxt_fetch_open_orders`、`ccxt_load_markets`、`ccxt_fetch_tickers`、`ccxt_fetch_funding_rates` 和 `ccxt_fetch_ohlcv`；并强制 `readOnlyToolAllowlist` 拒绝 mutating 工具，包括 `ccxt_create_*`、`ccxt_cancel_*`、`ccxt_edit_*`、`ccxt_set_*`、margin、transfer 和 withdraw 工具。`ccxt_call` 只能用于明确审阅过的只读 exchange GET 方法，例如 Binance open-algo-order 读取，并且每个允许的 raw method 必须在轮次台账中命名后再调用。

不得把上一轮 Top 5 排名复用为当前轮结果。如果报告与上一轮比较，应写成“本轮已从当前 MCP 数据重新计算；与上一轮 Top5 重合：...”。避免使用“延续上一轮 Top5”之类措辞，除非明确说明这是重新计算后的重合对比。

## 执行结构

任何真实订单 MCP 调用前：

1. 输出 `V2.txt` 要求的完整交易计划。
2. 确认 account、positions、合约普通未成交委托和 conditional orders 均已成功读取。
3. 确认已有持仓处理已完成。
4. 确认订单 payload 能映射到选定的 `ccxt-mcp` 执行工具。
5. 当 `V2.txt` 要求时，确认已包含 stop loss 和 take profit。
6. 检查 `V2.txt` 最大持仓约束：如果当前持仓数已经达到或超过上限，不提交新增执行。如果当前持仓数低于上限且候选通过 CTA、仓位、成本和保护检查，按排名顺序评估候选，并允许符合条件的新 symbol 入场，直到达到上限或候选用完。
7. 对新开仓、保护移动、减仓、平仓、撤单和改杠杆等 mutating 动作，先写入同一 `cycle_id` 下的 `execution.planned` 或 `action.planned`。事件 payload 必须包含工具名、symbol、方向、数量、计划价、触发价、positionSide、reduceOnly、final order book 时间、允许最大价格漂移、净保本/经济 R 计算摘要和放弃条件。非紧急风险处置不得在计划事件写入失败时继续提交真实 mutating 调用。

Binance USDT-M 新开仓必须优先使用 `ccxt_create_protected_futures_entry` 提交 protected entry。该工具会先创建 close-position 止损和止盈 algo 保护单，再提交入场单；如果保护或入场失败，工具会撤销已接受保护并返回失败阶段。不要把 `ccxt_create_order_with_take_profit_and_stop_loss` 当作 Binance USDT-M 的首选路径；服务端虽会把该 bracket 调用改路由到 protected entry，但 V2 执行计划和审计里应直接写明 `ccxt_create_protected_futures_entry`。

非 Binance USDT-M 交易所才优先使用交易所支持的一体化保护订单工具，例如 `ccxt_create_order_with_take_profit_and_stop_loss`。否则使用交易所暴露的显式条件单工具提交入场和保护，例如 `ccxt_create_stop_loss_order`、`ccxt_create_take_profit_order`、`ccxt_create_trigger_order`、`ccxt_create_stop_order` 或 `ccxt_create_trailing_amount_order`。

任何执行 MCP 调用后：

1. 记录后端响应和可用的 order id。
2. 立即写入 `order.submitted`、`action.executed` 或 `action.remediated`，不得等到轮次结束再集中补写。payload 必须包含交易所 orderId/algoId、clientOrderId/clientAlgoId、avgPrice、executedQty、triggerPrice、createTime/updateTime/triggerTime、错误码、撤销结果、本地写入时间和 payload hash。
3. 重新读取账户快照。
4. 验证持仓状态。
5. 验证止损止盈保护。
6. 验证是否出现无对应持仓的残留条件/保护单；如果出现，先取消或按 `V2.txt` 处理风险，并再次读取账户、持仓、合约普通未成交委托和保护单。
7. 如果交易后保护缺失、不匹配、孤立或不清楚，按 `V2.txt` 处理风险；只限制受影响的 symbol/side，或在无法确认总仓位约束时暂停真实执行。
8. 如果动作已经发生但审计只能事后补录，事件 tags 或 payload 必须明确写 `reconstructed: true`，summary 必须写明“事后补录”，并记录交易所真实时间和本地补录时间。事后补录事件不能作为“提交前已审计”的证据，只能作为复盘证据。

## 强制最终总结

每一轮都必须以完整总结结束。不得因为不交易、阻塞、dry-run、部分数据或错误而省略。使用以下结构，并明确标记 unavailable 字段：

- Cycle：timestamp、cadence、V2 source path/status、exchange、live/dry-run state。
- Audit：cycle_id、audit data dir、audit write status、hash chain status、missing audit stages。
- Data acquisition：account、positions、合约普通未成交委托、conditional/protection orders、market batch calls、使用的 incremental cursors、missing data 和 rate-limit/API issues。
- Account and exposure：可用的 equity/balance 字段、当前持仓数、距离 V2 最大持仓上限的剩余名额、margin/leverage state，以及已有持仓管理动作。
- Market scan：full-universe size、eligible count、exclusions、seed list size、long Top 5、short Top 5，以及排名是否从当前轮数据重新计算。
- CTA and candidates：每个被考虑的排序候选、CTA pass/fail、veto/downrank context，以及被拒绝时的明确 no-trade reason。
- Risk and sizing：每个候选的 risk、stop distance、target、RR、size、leverage/margin impact 和 position-cap decision。
- Execution：live/dry-run action、entry orders、protection orders、order ids/responses、failed execution calls，以及 SL/TP 是否同步。
- Post-action verification：最终 positions、合约普通未成交委托、conditional/protection orders、孤立保护单检查、unresolved risks，以及下一轮候选级执行资格。
- Next cycle：下一次运行时间、需要带到下一轮的 cursors/timestamps，以及如果循环应停止时的明确 stop reason。

## 状态报告

状态请求只总结当前轮，不重述所有 V2 规则：

- 账户预检结果。
- 审计状态：cycle_id、审计落盘路径、hash chain 是否连续，以及缺失事件。
- 已有持仓审查。
- 候选级新开仓资格：哪些候选允许执行、哪些候选因 CTA/仓位/风险/保护/数据原因跳过，并给出明确原因。
- 市场扫描状态和候选数量。
- 可用时输出 long/short Top 5，并标记为从本轮 MCP payload 重新计算。
- 上一轮重合只能作为对比字段，不能作为当前排名来源。
- 最终候选或未执行原因。如果没有新开仓，区分无候选、CTA 拒绝、仓位/风险/保护硬约束不通过、市场环境弱，或已有敞口已经足够。
- V2 候选级硬约束的明确阻塞项。
- 任何 MCP 执行结果。
- 动作后保护状态。
- 下一轮时间或停止原因。
