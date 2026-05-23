---
name: codex-trading-brain
description: 当用户明确要求 Codex 本身通过 ccxt-mcp 启动、停止、监控或操作 V2.txt 加密货币合约交易流程时使用，包括可选外部加密数据覆盖；本 skill 不得重复 V2 策略规则。
---

# Codex 交易大脑

## 责任边界

把 `V2.txt` 视为策略、阈值、风控和自主交易判断的来源。本 skill 只负责运行外壳：循环状态机、MCP 工具顺序、批量/增量取数纪律、执行后复核，以及最终每轮总结结构。

如果本 skill 与 `V2.txt` 在策略阈值或风控限制上冲突，按 `V2.txt` 执行。如果冲突点是循环机制、MCP 取数纪律或强制总结结构，按本 skill 执行。如果 `V2.txt` 缺失或不可读，停止交易。

## 核心契约

作为交易大脑运行：读取 `V2.txt`，通过 MCP 工具读取账户和行情数据，根据当前 V2 规则推理，并且只在 `V2.txt` 允许时调用 MCP 执行工具。

Codex 的推理角色不可委派。Codex 必须亲自根据当前 MCP 返回数据完成截面解释、CTA 确认、候选剔除、风险收益判断、仓位计算、交易/不交易决策和最终方案表述。不得把这些判断移交给后台 runner、本地脚本、cron 循环、生成式扫描器或 subagent。

自动化只能适配传输、批量调用只读 MCP、重试同一个失败读取、以及把返回数据整理成便于 Codex 审阅的格式。如果自动化开始给候选排名、标记 `reviewRequired`、分配置信度、撰写 CTA 理由、决定 `no_trade`/`trade`、计算仓位或生成最终每轮决策，它就已经变成交易大脑，必须停止。

每一轮必须严格按以下顺序执行。不得跳过后续阶段；如果前置阶段被阻塞，也要继续输出最终总结并记录阻塞原因。

1. 重新读取或确认当前 `V2.txt` 规则。
2. 如有需要，发现/加载 `ccxt-mcp` 工具。
3. 通过 `ccxt-mcp` 读取账户、持仓、合约普通未成交委托、条件单和保护单。合约普通未成交委托指 `ccxt_fetch_open_orders` 返回的非条件、未成交合约订单；它不是现货订单，也不包含已成交后形成的持仓。
4. 完成持仓/订单/保护单对账：持仓事实只能来自 `positions` 和 balance 中的 positions；条件单、algo 单、TP/SL 或 reduce-only 保护单不得反向证明持仓存在。若无对应持仓但存在条件/保护单，必须标记为孤立保护单，优先取消或按 V2 风控处理；复核清零前只限制受影响的 symbol/side，或在影响总敞口时限制新增执行。
5. 先管理已有持仓：验证保护单、识别漂移，并在考虑新开仓前按 V2 规则处理退出或调整。
6. 通过 `ccxt-mcp` 扫描配置好的 CCXT 合约市场池，优先使用批量和增量调用。
7. 基于当前轮 MCP 数据完成截面选币。
8. 对每个排序候选做 CTA 确认，判断是否可交易。
9. 对每个可交易候选执行风控和仓位计算。
10. 如果当前持仓数低于 `V2.txt` 定义的最大持仓上限，按排名顺序开符合 CTA、仓位、风险、成本、盘口和保护单硬约束的新币种，直到候选用完或账户达到持仓上限。不得开重复币种。
11. 只有在候选通过 V2 的 CTA、仓位、风险、成本、盘口和保护单硬约束，且真实交易明确启用时，才通过 `ccxt-mcp` 提交入场和同步止损/止盈保护。
12. 重新读取执行结果、持仓、合约普通未成交委托和 TP/SL 状态。
13. 输出强制最终每轮总结。无论是不交易、阻塞、dry-run、错误还是超时轮次，都必须输出。
14. 按配置间隔等待，并重复循环，同时动态管理所有已有持仓。

## MCP 数据流

按以下顺序使用 MCP：

1. `ccxt-mcp` 账户状态：config、balance、positions、margin/leverage、交易所返回的 PnL 字段、合约普通未成交委托、已关闭/已取消订单，以及交易所暴露的条件/保护单。
2. `ccxt-mcp` 行情数据：exchange markets、24h tickers、买一卖一或 order book、funding/mark、open interest 和 candles。
3. 可选免费外部 MCP 覆盖：可用且相关时，可用 CoinGecko public 或其他无付费计划来源。
4. Codex 推理：根据 `V2.txt` 推导具体过滤、排序、CTA 确认、仓位、TP/SL 和策略报告字段。
5. `ccxt-mcp` 执行：只有 V2 方案明确允许时，才下单、平仓、改单、撤单或修改合约订单。
6. 再次读取 `ccxt-mcp` 账户状态：复核动作后的账户、持仓、订单和保护状态。

MCP 能力名称和第一波扫描结构见 `references/v2-operating-procedure.md`。
可选外部数据源政策，包括免费优先和付费源排除规则，见 `references/mcp-data-policy.md`。

## 工具纪律

行情和账户扫描必须使用 `ccxt-mcp` 工具。不得用临时本地 shell、Python、REST、网页抓取或文件生成扫描脚本替代 `ccxt-mcp` 调用。

V2 实盘决策轮次中，不得调用 web search、browser search 或通用网页/新闻检索工具。必须先完成必需的 `ccxt-mcp` 账户、订单、保护和行情读取。可选外部背景只能在必需 `ccxt-mcp` 数据足够完成 V2 判断后，通过已经配置好的免费 MCP/数据提供工具查询。如果没有配置好的免费可选源，记录 `optionalDataMissing` 或 `freeOnlySkipped`；不得用通用 Reuters、CoinDesk、BTC/ETH、Binance futures、波动率或新闻搜索来启动或解锁实盘轮次。

只有在当前 Codex 会话没有暴露原生 MCP 工具时，才允许临时 Node MCP client 作为真实 `ccxt-mcp` server 的 stdio 传输适配器。它必须用显式绝对 `cwd` 启动 `ccxt-mcp/dist/index.js`，`cwd` 指向 `ccxt-mcp` 包目录；数据采集前必须调用 `listTools`，并且只有预期的 `ccxt_` 只读工具存在时才继续。不得从 `process.cwd()` 推导 MCP server cwd。wrapper 不得 import `ccxt`、使用 `fetch`/REST、抓网页，或从文件计算行情；它只能调用 MCP 工具并整理返回 payload。必须维护 `readOnlyToolAllowlist`，并在任何 mutating 工具前中止，例如 `ccxt_create_*`、`ccxt_cancel_*`、`ccxt_edit_*`、`ccxt_set_*`、`ccxt_add_margin`、`ccxt_reduce_margin`、`ccxt_transfer` 或 `ccxt_withdraw`。`ccxt_call` 只能用于明确审阅过的只读 exchange GET 方法，并且每个允许的方法名必须在轮次开始前列出。

不得为实盘轮次创建持久自主 runner。临时适配器必须由当前 Codex 回合掌控，不得包含策略逻辑，并且必须把每个排名、CTA、风险、执行和总结决策交回 Codex。它不得 sleep-loop 到未来轮次、维护策略状态、追加最终轮次总结，或在候选需要自由裁量审阅后继续运行。

如果越过上述边界，立即停止进程，移除或禁用 runner，审计日志中是否存在 mutating 调用和缺失的 Codex 决策，记录纠正措施，然后只在 Codex 控制的轮次中恢复。

如果缺少必需的 `ccxt-mcp` 行情、账户或执行能力，报告缺失能力并返回阻塞/状态结果。不得静默退回自制扫描器。

任何真实执行前，调用 `ccxt_get_config` 并确认交易所、账户凭据、需要时的代理存在性，以及交易开关状态。如果 `CCXT_ENABLE_TRADING` 不是 true，或 `CCXT_DRY_RUN` 是 true，把执行工具视为模拟，报告 dry-run 结果，不得声称已经真实下单。

每一轮都必须从当前 MCP payload 重新计算合格池、long Top 5、short Top 5 和候选列表。上一轮 Top 5 只能在重新计算后作为对比，绝不能作为当前排名的输入或缓存。

第一轮基线后使用增量取数：当工具支持 `since` 或 `limit` 时，为 candles、orders、trades 和 account events 保留按 symbol 的 timestamp/cursor。全市场覆盖仍然必须完成，但要用批量调用和缓存静态 metadata，避免每轮重新下载完整历史数据。

优先使用高密度 MCP 调用，而不是零散调用：可用时使用全 symbol 或多 symbol 工具，例如 `ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices`、`ccxt_fetch_open_interests`、`ccxt_fetch_positions` 和订单/账户批量端点。只有截面 seed list 缩窄后，才按 symbol 扇出读取。

本地 shell 命令只允许用于 repo/config 检查，不能用于实盘行情发现。如果 repo 检查不可避免地需要本地 Python 命令，使用 `python3`；不要假设存在 `python` alias。

## 连续运行

默认节奏是每 60 秒一个决策轮次，除非用户给出其他间隔。在当前 Codex CLI/session 中持续运行，直到用户停止、新指令改变目标、MCP 工具不可用，或 V2 风控/账户状态要求停止。

不要因为某一轮没有交易就停止。`No trade` 是正常的 V2 决策。

## 硬边界

- `V2.txt` 可用时，不得使用记忆中的阈值。
- MCP 能力缺失时，不得编造行情数据。
- 不得静默下单；必须先输出 V2 交易计划。
- 如果 V2 要求止损止盈，不得在没有止损止盈的情况下下单。
- 当账户、订单、持仓或保护状态不清楚时，不得声称已满足仓位约束，也不得提交真实执行。
- 不得把条件单、algo 单、TP/SL 或 reduce-only 保护单当作持仓存在的证据；没有对应持仓的保护单是孤立保护单，必须清理或报告阻塞并复核。
- 不得省略最终每轮总结。即使是部分轮次，也必须输出完整总结，并把缺失字段标记为 unavailable 且说明原因。
