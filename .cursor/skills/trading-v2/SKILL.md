---
name: trading-v2
description: 当用户明确提到 $trading-v2、trading-v2、V2.txt，或要求 Codex 通过 ccxt-mcp 按 V2 运行 Binance USDT-M 永续合约交易、监控、下单、撤单、改单、减仓、平仓或复核时使用。
---

# 交易 V2

## 责任边界

把仓库根目录的 `V2.txt` 视为策略、阈值、风控和自主交易判断的唯一来源。本 skill 只负责运行外壳：循环状态机、MCP 工具顺序、批量/增量取数纪律、执行后复核，以及最终每轮总结结构。

如果本 skill 与 `V2.txt` 在策略阈值、风控限制或下单授权上冲突，按 `V2.txt` 执行。如果冲突点是循环机制、MCP 取数纪律、审计写入或强制总结结构，按本 skill 执行。如果 `V2.txt` 缺失或不可读，停止交易。

## 核心契约

作为 V2 交易大脑运行：读取 `V2.txt`，通过 MCP 工具读取账户和行情数据，根据当前 V2 规则推理，并且只在 `V2.txt` 允许时调用 MCP 执行工具。

Codex 的推理角色不可委派。Codex 必须亲自根据当前 MCP 返回数据完成 V2 要求的市场解释、候选剔除、风险收益判断、仓位计算、交易/不交易决策和最终方案表述。不得把这些判断移交给后台 runner、本地脚本、cron 循环、生成式扫描器或 subagent。

自动化只能适配传输、批量调用只读 MCP、重试同一个失败读取、以及把返回数据整理成便于 Codex 审阅的格式。如果自动化开始替 Codex 排名、筛选、分配置信度、撰写交易理由、决定 `no_trade`/`trade`、计算仓位或生成最终每轮决策，它就已经变成交易大脑，必须停止。

每一轮必须严格按以下顺序执行。不得跳过后续阶段；如果前置阶段被阻塞，也要继续输出最终总结并记录阻塞原因。每轮开始时生成 `cycle_id`，并优先通过 `audit-system` 写入本地审计事件；审计写入失败不替代交易风控判断，但必须在最终总结中报告缺口。

单轮不得为了等待未来 K 线收盘、未来盘口变化或下一次资金费率时间点而长时间阻塞。需要等待未来确认时，本轮必须按当前数据完成 CTA/风控判断，写明候选观察计划和下一轮触发条件，然后输出 `summary.finalized`；下一轮重新读取 MCP 当前数据后再判断。

1. 重新读取或确认当前 `V2.txt` 规则。
2. 如有需要，发现/加载 `ccxt-mcp` 工具。
3. 生成本轮 `cycle_id`，写入 `cycle.started` 审计事件；如果 `audit-system` 不可用，记录 `auditUnavailable` 并继续执行策略轮次。
4. 通过 `ccxt-mcp` 读取账户、持仓、合约普通未成交委托、条件单和保护单，并把工具名、参数摘要、返回摘要、耗时、错误和 payload hash 写入 `mcp.call` 审计事件。合约普通未成交委托指 `ccxt_fetch_open_orders` 返回的非条件、未成交合约订单；它不是现货订单，也不包含已成交后形成的持仓。
5. 完成持仓/订单/保护单对账：持仓事实只能来自 `positions` 和 balance 中的 positions；条件单、algo 单、TP/SL 或 reduce-only 保护单不得反向证明持仓存在。若无对应持仓但存在条件/保护单，必须标记为孤立保护单，优先取消或按 V2 风控处理；复核清零前只限制受影响的 symbol/side，或在影响总敞口时限制新增执行。
6. 先管理已有持仓：验证保护单、识别漂移，并在考虑新开仓前按 V2 规则处理退出或调整。
7. 通过 `ccxt-mcp` 扫描配置好的 CCXT 合约市场池，优先使用批量和增量调用；把宽市场摘要写入 `market.snapshot`。
8. 基于当前轮 MCP 数据完成 V2 要求的市场分析；必须区分市场报告榜单和可执行 seed list。long/short Top 5、24h 涨跌幅榜和极端标的只用于截面报告，不得直接等同于 CTA 候选池；可执行 seed list 必须按 `V2.txt` 的结构位置、二段机会、止损清晰度、目标空间和成本可执行性筛出。把排名、排除项和 seed list 写入 `candidate.ranked` / `candidate.filtered`。
9. 对每个排序候选做 V2 交易确认，判断是否可交易；把每个候选的确认结果写入 `cta.decided`。
10. 对每个可交易候选执行风控和仓位计算；把每个候选的仓位、风险收益、成本覆盖和剔除原因写入 `risk.sized`。
11. 如果当前持仓数低于 `V2.txt` 定义的最大持仓上限，按 V2 允许的方式执行符合仓位、风险、成本、盘口和保护边界的新币种，直到候选用完或账户达到持仓上限。不得开重复净方向。
12. 只有在候选通过 `V2.txt` 的仓位、风险、成本、盘口和保护边界，且真实交易明确启用时，才通过 `ccxt-mcp` 提交入场、退出、撤改或保护动作；提交前写 `execution.planned`，dry-run 写 `order.dry_run`，真实提交响应写 `order.submitted`。
13. 重新读取执行结果、持仓、合约普通未成交委托和 TP/SL 状态，并写入 `post.verify`。
14. 输出强制最终每轮总结，写入 `summary.finalized` 审计事件。无论是不交易、阻塞、dry-run、错误、超时、用户暂停还是用户中断轮次，只要当前会话仍可继续写入审计，都必须输出；中断总结应标记为 `interrupted` 或 `paused`，并说明未完成阶段和真实执行状态。
15. 在 `summary.finalized` 之后按配置间隔等待，并重复循环，同时动态管理所有已有持仓。等待只发生在两个轮次之间，不用于把当前轮挂起到未来确认。

## MCP 数据流

按以下顺序使用 MCP：

1. `ccxt-mcp` 账户状态：config、balance、positions、margin/leverage、交易所返回的 PnL 字段、合约普通未成交委托、已关闭/已取消订单，以及交易所暴露的条件/保护单。
2. `ccxt-mcp` 行情数据：exchange markets、24h tickers、买一卖一或 order book、funding/mark、open interest 和 candles。
3. 可选免费外部 MCP 覆盖：可用且相关时，可用 CoinGecko public 或其他无付费计划来源。
4. Codex 推理：根据 `V2.txt` 推导具体市场解释、交易/不交易判断、仓位、保护/退出方案和策略报告字段。
5. `ccxt-mcp` 执行：只有 V2 明确允许时，才下单、平仓、改单、撤单或修改合约订单。
6. 再次读取 `ccxt-mcp` 账户状态：复核动作后的账户、持仓、订单和保护状态。

MCP 能力名称和第一波扫描结构见 `references/v2-operating-procedure.md`。
可选外部数据源政策，包括免费优先和付费源排除规则，见 `references/mcp-data-policy.md`。

## 工具纪律

行情和账户扫描必须使用 `ccxt-mcp` 工具。不得用临时本地 shell、Python、REST、网页抓取或文件生成扫描脚本替代 `ccxt-mcp` 调用。

V2 实盘决策轮次中，不得调用 web search、browser search 或通用网页/新闻检索工具。必须先完成必需的 `ccxt-mcp` 账户、订单、保护和行情读取。可选外部背景只能在必需 `ccxt-mcp` 数据足够完成 V2 判断后，通过已经配置好的免费 MCP/数据提供工具查询。如果没有配置好的免费可选源，记录 `optionalDataMissing` 或 `freeOnlySkipped`；不得用通用 Reuters、CoinDesk、BTC/ETH、Binance futures、波动率或新闻搜索来启动或解锁实盘轮次。

只有在当前 Codex 会话没有暴露原生 MCP 工具时，才允许临时 Node MCP client 作为真实 `ccxt-mcp` server 的 stdio 传输适配器。它必须用显式绝对 `cwd` 启动 `ccxt-mcp/dist/index.js`，`cwd` 指向 `ccxt-mcp` 包目录；数据采集前必须调用 `listTools`，并且只有预期的 `ccxt_` 只读工具存在时才继续。不得从 `process.cwd()` 推导 MCP server cwd。wrapper 不得 import `ccxt`、使用 `fetch`/REST、抓网页，或从文件计算行情；它只能调用 MCP 工具并整理返回 payload。必须维护 `readOnlyToolAllowlist`，并在任何 mutating 工具前中止，例如 `ccxt_create_*`、`ccxt_cancel_*`、`ccxt_edit_*`、`ccxt_set_*`、`ccxt_add_margin`、`ccxt_reduce_margin`、`ccxt_transfer` 或 `ccxt_withdraw`。`ccxt_call` 只能用于明确审阅过的只读 exchange GET 方法，并且每个允许的方法名必须在轮次开始前列出。

不得为实盘轮次创建持久自主 runner。临时适配器必须由当前 Codex 回合掌控，不得包含策略逻辑，并且必须把每个市场判断、风险、执行和总结决策交回 Codex。它不得 sleep-loop 到未来轮次、维护策略状态、追加最终轮次总结，或在候选需要自由裁量审阅后继续运行。

如果越过上述边界，立即停止进程，移除或禁用 runner，审计日志中是否存在 mutating 调用和缺失的 Codex 决策，记录纠正措施，然后只在 Codex 控制的轮次中恢复。

如果缺少必需的 `ccxt-mcp` 行情、账户或执行能力，报告缺失能力并返回阻塞/状态结果。不得静默退回自制扫描器。

任何真实执行前，调用 `ccxt_get_config` 并确认交易所、账户凭据、需要时的代理存在性，以及交易开关状态。如果 `CCXT_ENABLE_TRADING` 不是 true，或 `CCXT_DRY_RUN` 是 true，把执行工具视为模拟，报告 dry-run 结果，不得声称已经真实下单。

每一轮都必须从当前 MCP payload 重新计算 V2 要求的合格池、long Top 5、short Top 5 和候选列表。上一轮结果只能作为对比，绝不能作为当前判断的输入或缓存。

第一轮基线后使用增量取数：当工具支持 `since` 或 `limit` 时，为 candles、orders、trades 和 account events 保留按 symbol 的 timestamp/cursor。全市场覆盖仍然必须完成，但要用批量调用和缓存静态 metadata，避免每轮重新下载完整历史数据。

优先使用高密度 MCP 调用，而不是零散调用：可用时使用全 symbol 或多 symbol 工具，例如 `ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices`、`ccxt_fetch_open_interests`、`ccxt_fetch_positions` 和订单/账户批量端点。只有 V2 seed list 缩窄后，才按 symbol 扇出读取。

本地 shell 命令只允许用于 repo/config 检查和 `audit-system` 本地审计写入，不能用于实盘行情发现。`audit-system` CLI 只能写入本地 JSON 审计事件，不得读取行情、调用交易所或执行交易。如果 repo 检查不可避免地需要本地 Python 命令，使用 `python3`；不要假设存在 `python` alias。

## 连续运行

默认节奏是每 60 秒一个决策轮次，除非用户给出其他间隔。在当前 Codex CLI/session 中持续运行，直到用户停止、新指令改变目标、MCP 工具不可用，或 V2 风控/账户状态要求停止。不要在某一轮内部 sleep 到未来 K 线收盘；把等待条件写入本轮最终总结，并交给下一轮复核。

不要因为某一轮没有交易就停止。`No trade` 是正常的策略决策。

## 硬边界

- `V2.txt` 可用时，不得使用记忆中的阈值。
- MCP 能力缺失时，不得编造行情数据。
- 不得静默下单；必须先输出 V2 要求的交易计划或执行摘要。
- 如果 V2 要求保护或退出机制，不得在没有对应机制的情况下新增风险敞口。
- 当账户、订单、持仓或保护状态不清楚时，不得声称已满足仓位约束，也不得提交真实执行。
- 不得把审计系统当成交易系统；审计系统只记录本地事件和展示复盘，不允许下单、撤单、改仓、转账或提现。
- 不得把条件单、algo 单、TP/SL 或 reduce-only 保护单当作持仓存在的证据；没有对应持仓的保护单是孤立保护单，必须清理或报告阻塞并复核。
- 不得省略最终每轮总结。即使是部分轮次、用户中断或暂停，也必须在会话仍可写审计时输出完整总结，并把缺失字段标记为 unavailable 且说明原因。
