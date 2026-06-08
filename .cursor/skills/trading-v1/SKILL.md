---
name: trading-v1
description: 当用户明确提到 $trading-v1、trading-v1、V1.txt，或要求 Codex 通过 ccxt-mcp 按 V1 运行 Binance USDT-M 永续合约实盘交易、监控、下单、撤单、改单、减仓、平仓或复核时使用。
---

# 交易 V1

## 责任边界

把仓库根目录的 `V1.txt` 视为策略、阈值、风控和自主交易判断的唯一来源。本 skill 只负责运行外壳：MCP 工具顺序、账户/订单/保护预检、全市场扫描纪律、受保护执行、动作后复核，以及最终总结结构。

如果本 skill 与 `V1.txt` 在策略阈值、风控限制或下单授权上冲突，按 `V1.txt` 执行。如果冲突点是 MCP 取数纪律、执行复核或强制总结结构，按本 skill 执行。如果 `V1.txt` 缺失或不可读，停止交易。

## 核心契约

作为 V1 超级短线交易大脑运行：读取 `V1.txt`，通过 MCP 工具读取账户和行情数据，根据当前 V1 规则完成全市场扫描、微观结构判断、风控仓位和受保护执行，并且只在 `V1.txt` 允许时调用 MCP 执行工具。

V1 是多机会、多仓位流程。每轮必须形成组合级 `approvedActions[]` / `rejectedCandidates[]`，不得把全市场候选压缩成单一最高分 symbol。若最终只交易 1 个或 0 个 symbol，最终总结和审计 payload 必须逐个说明其他候选被剔除的具体硬门禁原因。

V1 当前按 `V1.txt` 执行方向中性的 signed cross-section / signed CTA / micro-CTA 流程。short 候选不再由 skill 外壳默认暂停；只要 `V1.txt` 允许、`shortExceptionGate` 或等价 short 执行门禁全部通过，并且计划写明 0.5R squeeze 复核条件、AI 失效判断标准、风险约束和审计复核字段，就可以和 long 一样进入真实 `approvedActions[]`。0.5R 或固定时间未推进不得由 skill 外壳解释为机械主动平仓/减仓授权。

Codex 的交易大脑角色不可委派。Codex 必须亲自根据当前 MCP 返回数据完成 V1 要求的市场解释、候选剔除、风险收益判断、仓位计算、交易/不交易决策和最终方案表述。不得把这些判断移交给后台 runner、本地脚本、cron 循环、生成式扫描器或外部模型。

当前账户不支持旁路模型复核能力，V1 外壳不得要求、尝试、等待或记录额外模型复核。V1 只采用当前 Codex 单主脑决策、`ccxt-mcp` 账户/行情/执行工具和 `audit-system` 审计闭环。缺少额外模型复核能力不得写成 `auditGaps`、`noTradeReason`、候选拒绝项、short gate 失败项或真实执行阻塞。

自动化只能：传输适配 MCP、批量调用只读 MCP、重试同一个失败读取、整理返回数据格式、把 V1 要求的派生字段按公式算出来后交回 Codex 复核。如果自动化开始替 Codex 排名、筛选、分配置信度、撰写交易理由、决定 `no_trade`/`trade`、计算仓位、生成订单 payload 或生成最终决策，它就已经变成交易大脑，必须停止并记录为越权建议。

不得创建后台 runner、cron、sleep-loop、持续自动监控器或持久自主交易进程。这里的 runner 指后台自动进程，不影响 `V1.txt` 中“盈利 runner / 尾仓管理”的交易概念。

## 审计纪律

V1 实盘轮次必须写入本地 `audit-system`。如果 `audit-system` 不可用，仍然必须输出完整总结并明确 `auditUnavailable`，但该轮不能标记为完整可审计轮次。

每轮开始必须生成 `cycle_id` 并写入 `cycle.started`，payload 至少包含 `strategyFile` 或 `strategyPath`、`skillPath`、`config` 或 `exchange`、初始账户读取状态和 `auditSchemaVersion`。任何阶段失败、工具缺失、dry-run、no-trade、用户中断或真实执行阻塞，都必须继续写入 `summary.finalized`，不能只在有交易时写审计。

每轮按阶段尽量写入可复盘事件：`account.loaded`、`positions.reconciled`、`market.scanned`、`candidate.ranked`、`cta.decided`、`risk.sized`、`execution.planned`、`order.submitted` 或 `execution.skipped`、`post_action.reviewed`。未交易、阻塞或观察轮次必须在 `summary.finalized` 前写入 `execution.skipped` 或等价 action/execution 事件，明确记录组合层面 `approvedActions[]`、`rejectedCandidates[]`、`skippedActions[]` 和硬阻塞原因。阶段事件缺失时，最终 summary payload 必须列出缺口和原因。

当用户要求按半小时复盘 V1 执行情况时，本轮必须把复盘作为 V1 审计的一部分写入 `review.completed` 或等价 review 事件。payload 至少包含复盘窗口、真实执行结果、止盈/止损/主动退出、no-trade 主因、审计缺口、优化方案、实际修改的文件或 `optimizationDeferred` 原因，以及下一次复盘触发条件。

`summary.finalized` payload 至少包含：

1. `strategyFile` 或 `strategyPath`。
2. `config` 或 `exchange`，含 `CCXT_ENABLE_TRADING` 和 `CCXT_DRY_RUN` 摘要。
3. `accountSummary`，含权益、可用余额、保证金、未实现盈亏、持仓、普通未成交委托、条件/保护单。
4. `positionReview` 或等价已有仓位检查。
5. `marketScan` 或等价截面扫币结果。
6. `microCtaDecisions` 或等价 micro-CTA 判断。
7. `riskSizing` 或等价风控/仓位计算。
8. `plan` 或等价交易计划；必须支持 `approvedActions[]`、`rejectedCandidates[]`、`remainingPositionSlots`、`portfolioRiskAfterPlan` 和 `batchPlan[]`。若有 short 候选，还必须包含 `shortExceptionGate` 或 `shortExecutionGate`；若真实执行 short，还必须包含 0.5R squeeze 复核条件和 AI 失效判断标准。
9. `actions` 或等价执行/未执行结果；必须支持多 symbol、多批次和每批次动作后复核。
10. `postActionReview` 或等价动作后复核；未执行时按 `V1.txt` 使用轻量 post-review，写最终账户/订单/保护确认。
11. `noTradeReason` 和 `noTradeTags`；若未交易必须填写。
12. `nearPassTriggers[]`；若未交易或只有 observe-only 候选，必须按 `V1.txt` 输出接近触发的高流动性可执行清单。
13. `phaseTiming` 或等价阶段耗时，至少覆盖账户预检、市场扫描、CTA/风控、执行事件到 post-review、总耗时；慢阶段必须写原因。
14. `nextRoundFocus`。
15. `auditTrail`，含 JSONL 路径、payload hash、event hash、hash chain 校验结果或不可用原因。
16. `decisionMode` 或等价单主脑决策记录，明确当前 Codex 独立完成交易判断。

最终总结不得把“测试通过”“轮数计数”“有 summary 文本”当作审计完成证据；必须能用审计事件和 payload 字段复核本轮 V1 的账户、行情、CTA、风控、执行和复核链路。

## 强制每轮顺序

每一轮必须严格按以下顺序执行。不得跳过后续阶段；如果前置阶段被阻塞，也要继续输出最终总结并记录阻塞原因。

1. 重新读取或确认当前 `V1.txt` 规则。
2. 如有需要，发现/加载 `ccxt-mcp` 工具。
3. 通过 `ccxt-mcp` 读取配置、账户余额、持仓、合约普通未成交委托、条件单/保护单和理解当前敞口所需的近期成交。
4. 完成持仓/订单/保护单对账：持仓事实只能来自 positions 和 balance positions；条件单、algo 单、TP/SL 或 reduce-only 保护单不得反向证明持仓存在。若无对应持仓但存在条件/保护单，必须标记为孤立保护单。
5. 先管理已有持仓：验证保护单、识别漂移，并在考虑新开仓前按 V1 规则处理退出或调整。账户已有持仓本身不得作为禁止扫描或禁止新开仓的理由；只要已有持仓风险处理完成，且总持仓数、总风险、保证金、普通未成交订单和条件/保护单状态满足 `V1.txt`，本轮仍可继续寻找新开仓机会。
6. 如果已有持仓风险处理完成、普通未成交订单已按 `V1.txt` 成功分类且不存在未保护/冲突阻塞、条件单状态清楚，使用 `ccxt-mcp` 扫描全部 Binance USDT-M 合约市场池，优先使用批量只读调用，不得只看固定核心币或少数涨跌幅榜。
7. 基于当前 MCP 数据完成 V1 超级短线全市场分析；按 `V1.txt` 当前覆盖要求输出 setup bucket、long/short/scalp 排名、排除项和 micro-CTA 候选。
8. 记录运行模式为当前 Codex 单主脑决策；不得要求、等待或记录额外模型复核。
9. 对每个候选做 V1 micro-CTA 确认；必须说明做多、做空或放弃的理由。short 候选必须逐项检查 `shortExceptionGate` 或 `shortExecutionGate`，任一项缺失即只能观察、dry-run 或进入 `rejectedCandidates[]`。
10. 对每个可交易候选执行风控和仓位计算；硬校验 `V1.txt` 的最大名义、最大杠杆、单笔最大亏损、总风险、止损距离、RR、账户状态、交易所最小下单和保护单可创建性。short 还必须校验 0.5R squeeze 复核条件、保护复核路径和 AI 失效判断标准清楚；不得把 0.5R 复核写成机械主动平仓。
11. 将所有通过门禁且低相关的候选加入 `approvedActions[]`，直到仓位槽位、组合风险、保证金、单批上限或保护复核能力用完；不得因为已选出一个最高分候选、账户已有持仓或候选方向为 short 而跳过其他合格候选。
12. 只有候选通过 V1 的账户、持仓、订单、保护、仓位、风险、盘口和 CTA 门禁，且真实交易明确启用时，才通过 `ccxt-mcp` 提交入场、退出、撤单、改单或保护动作。
13. Binance USDT-M 新增真实仓位必须优先使用受保护入场能力；如果工具不可用，则按 V1 输出阻塞或使用明确可验证的手动保护序列。手动序列必须先确认 SL/TP 参数可创建，开仓后立即创建并复核保护；任一保护失败必须撤销开仓或平仓。
14. 真实入场、主动退出、保护移动、减仓、撤单或改单后，必须重新读取账户、持仓、普通未成交订单和 TP/SL 状态。若单批执行多个新增入场，必须在批次后复核清楚再继续下一批。
15. 写入 `summary.finalized` 审计事件，并输出 `V1.txt` 要求的最终总结。无论是不交易、阻塞、dry-run、错误、超时、用户暂停还是用户中断轮次，都必须明确输出当前阶段、真实执行状态、审计状态和未完成项。

如果 micro-CTA 条件依赖未来 K 线或未来盘口变化，不得在当前 Codex 回合中 sleep、轮询或持续等待到未来时间点。当前轮必须按未确认/观察处理，完成当前 `V1.txt` 的最终总结，并把下一轮需要复核的 symbol、setup、触发价、失效价、时间框架和主因标签写入“后续监控建议”。

## MCP 数据流

按以下顺序使用 MCP：

1. `ccxt-mcp` 账户状态：config、balance、positions、margin/leverage、交易所返回的 PnL 字段、合约普通未成交委托、已关闭/已取消订单，以及交易所暴露的条件/保护单。
2. `ccxt-mcp` 行情数据：exchange markets、24h tickers、买一卖一或 order book、recent trades、funding/mark、open interest、taker buy/sell volume 和 candles。
3. Codex 推理：根据 `V1.txt` 推导具体微观结构解释、交易/不交易判断、仓位、保护/退出方案、组合执行列表和策略报告字段。
4. `ccxt-mcp` 执行：只有 V1 明确允许时，才下单、平仓、改单、撤单或修改合约订单。
5. 再次读取 `ccxt-mcp` 账户状态：复核动作后的账户、持仓、订单和保护状态。

MCP 能力名称和第一波扫描结构见 `references/v1-operating-procedure.md`。

## 工具纪律

行情和账户扫描必须使用 `ccxt-mcp` 工具。不得用临时本地 shell、Python、REST、网页抓取或文件生成扫描脚本替代 `ccxt-mcp` 调用。V1 必须优先全市场扫描全部合格 USDT-M 永续；工具分页或数量受限时必须记录覆盖缺口。

V1 扫描按 `V1.txt` 的两层扫描执行：全市场轻量层覆盖所有合格 USDT-M 永续，详细重数据层默认 12-15 个 seed，最多 20 个。不得把 seed 上限解释为只看 12-15 个市场；它只限制逐 symbol order book、candles、taker、深度/RR 等重数据调用。轻量层已足够硬拒绝的标的不必再拉完整重数据。

V1 实盘决策轮次中，不得调用 web search、browser search 或通用网页/新闻检索工具满足行情、新闻或候选发现。必须先完成必需的 `ccxt-mcp` 账户、订单、保护和行情读取。

只有在当前 Codex 会话没有暴露原生 MCP 工具时，才允许临时 Node MCP client 作为真实 `ccxt-mcp` server 的 stdio 传输适配器。它必须用显式绝对 `cwd` 启动 `ccxt-mcp/dist/index.js`，`cwd` 指向 `ccxt-mcp` 包目录；数据采集前必须调用 `listTools`，并且只有预期的 `ccxt_` 只读工具存在时才继续。wrapper 不得 import `ccxt`、使用 `fetch`/REST、抓网页，或从文件计算行情；它只能调用 MCP 工具并整理返回 payload。

不得为实盘轮次创建持久自主 runner、cron、sleep-loop 或持续监控器。临时适配器必须由当前 Codex 回合掌控，不得包含策略逻辑，不得 sleep-loop 到未来轮次，不得维护策略状态，也不得追加最终总结。

如果缺少必需的 `ccxt-mcp` 行情、账户或执行能力，报告缺失能力并返回阻塞/状态结果。不得静默退回自制扫描器。

任何真实执行前，调用 `ccxt_get_config` 并确认交易所、账户凭据、需要时的代理存在性，以及交易开关状态。如果 `CCXT_ENABLE_TRADING` 不是 true，或 `CCXT_DRY_RUN` 是 true，把执行工具视为模拟，报告 dry-run 结果，不得声称已经真实下单。

## 执行纪律

任何真实订单 MCP 调用前：

1. 输出 `V1.txt` 要求的完整交易计划。
2. 确认 account、positions、合约普通未成交委托和 conditional orders 均已成功读取。
3. 确认已有持仓处理已完成；不得仅因已有持仓存在而阻止新开仓评估。
4. 确认订单 payload 能映射到选定的 `ccxt-mcp` 执行工具。
5. 确认包含 stop loss 和 take profit。
6. 确认未超过 V1 最大持仓、单批新增入场上限、组合风险和剩余仓位槽位。
7. 确认计划杠杆、名义金额、最大亏损、保证金占用和本轮新增风险动作数量均满足 `V1.txt`；如果有多个合格候选，必须确认哪些进入 `approvedActions[]`，哪些进入 `rejectedCandidates[]` 以及原因。
8. 若订单方向为 short，确认 `shortExceptionGate` 或 `shortExecutionGate` 全部通过、0.5R squeeze 复核条件和 AI 失效判断标准会写入审计；否则不得提交真实 short。0.5R 或固定时间未推进不得作为机械主动平仓/减仓授权。

Binance USDT-M 新开仓优先使用受保护入场工具。如果必须使用手动序列，执行计划必须写明原因，并严格按“确认保护参数可创建 -> 开仓 -> 读取成交 -> 创建 SL -> 创建 TP -> 复核保护 -> 失败即撤销或平仓”的顺序执行。

任何执行 MCP 调用后：

1. 记录后端响应和可用的 order id。
2. 立即重新读取账户快照、positions、balance positions、合约普通未成交委托、open algo orders 和最近 closed orders/trades。
3. 验证持仓状态、成交均价和手续费。
4. 验证止损止盈保护。
5. 验证是否出现无对应持仓的残留条件/保护单。
6. 如果交易后保护缺失、不匹配、孤立或不清楚，按 `V1.txt` 处理风险；不得继续新增风险。

## 强制最终总结

每一轮都必须以完整总结结束。不得因为不交易、阻塞、dry-run、部分数据或错误而省略。总结使用当前 `V1.txt` 的最终格式：

1. 账户摘要。
2. 已有仓位检查。
3. 截面扫币结果。
4. 方向表现记录。
5. micro-CTA 判断，包含 `decisionMode=single_codex_brain`。
6. 交易计划。
7. 执行结果。
8. 后续监控建议。
9. 审计溯源。

如果字段不可用，必须写 `unavailable` 并说明原因。最终总结必须明确：

1. 本轮是否真实下单。
2. 如果未交易，未交易的硬阻塞原因。
3. 如果已执行，订单、成交、止盈止损和每个执行批次后的账户/持仓复核状态。
4. 下一轮应优先复核的风险点、setup bucket、触发价、失效价或数据缺口。
5. `cycle_id`、审计落盘路径、关键事件阶段、phaseTiming、payload hash、event hash、hash chain 校验结果，以及任何审计缺口。

## 硬边界

- `V1.txt` 可用时，不得使用记忆中的阈值。
- MCP 能力缺失时，不得编造行情数据。
- 不得静默下单；必须先输出 V1 要求的交易计划或执行摘要。
- 不得在没有止盈止损保护机制的情况下新增风险敞口。
- 当账户、订单、持仓或保护状态不清楚时，不得声称已满足仓位约束，也不得提交真实执行。
- 不得把条件单、algo 单、TP/SL 或 reduce-only 保护单当作持仓存在的证据。
- 不得省略最终总结。
- 不得请求人工确认来放宽 `V1.txt` 硬风控。
- 不得把 BTC/ETH 趋势作为单币超级短线机会的唯一否决理由。
- 不得用 15m/1h 同向确认替代 micro-CTA 的盘口、主动流、深度、滑点和短周期结构判断。
- 不得把 V1 最终总结的单行字段解释为只能交易单个 symbol；多候选、多计划和多执行结果必须用列表或表格输出。
- 不得新增真实 short，除非 `V1.txt` 的 `shortExceptionGate` 或 `shortExecutionGate` 全部通过并且计划包含 0.5R squeeze 复核条件和 AI 失效判断标准；不得把 0.5R 或固定时间未推进解释为机械主动平仓/减仓授权。
- 不得让外部模型、脚本或后台进程替 Codex 做交易判断、仓位计算、订单 payload、执行动作、主动退出判断或最终总结。
- 不得创建后台 runner、cron、sleep-loop、持续自动监控器或持久自主交易进程运行 V1。
