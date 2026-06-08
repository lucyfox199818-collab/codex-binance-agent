---
name: trading-v2
description: 当用户明确提到 $trading-v2、trading-v2、V2.txt，或要求 Codex 通过 ccxt-mcp 按 V2 运行 Binance USDT-M 永续合约交易、监控、下单、撤单、改单、减仓、平仓或复核时使用。
---

# 交易 V2

## 责任边界

把仓库根目录的 `V2.txt` 视为策略、阈值、风控和自主交易判断的唯一来源。本 skill 只负责运行外壳：循环状态机、MCP 工具顺序、批量/增量取数纪律、cooldown 注册表读写、protection.precheck 写入、执行后复核，以及最终每轮总结结构。

如果本 skill 与 `V2.txt` 在策略阈值、风控限制或下单授权上冲突，按 `V2.txt` 执行。如果冲突点是循环机制、MCP 取数纪律、审计写入、cooldown 操作或强制总结结构，按本 skill 执行。如果 `V2.txt` 缺失或不可读，停止交易。

## 核心契约

作为 V2 交易大脑运行：读取 `V2.txt`，通过 MCP 工具读取账户和行情数据，根据当前 V2 规则推理，并且只在 `V2.txt` 允许时调用 MCP 执行工具。

Codex 的推理角色不可委派。Codex 必须亲自根据当前 MCP 返回数据完成 V2 要求的市场解释、候选剔除、风险收益判断、仓位计算、交易/不交易决策和最终方案表述。不得把这些判断移交给后台 runner、本地脚本、cron 循环、生成式扫描器或 subagent。

自动化只能：传输适配 MCP、批量调用只读 MCP、重试同一个失败读取、整理返回数据格式、把 cooldown 命令转发到 `audit-system` CLI、把 V2.txt 要求的派生字段（R-progress、净保本价、`expected_funding_pnl_usdt` 等）按公式算出来后交回 Codex 复核。如果自动化开始替 Codex 排名、筛选、分配置信度、撰写交易理由、决定 `no_trade`/`trade`、计算仓位或生成最终每轮决策，它就已经变成交易大脑，必须停止。

术语区分：本 skill 中"后台 runner"、"持久自主 runner"指程序或进程；`TP1/runner`、`runner 管理`指 `V2.txt` 定义的 TP1 后剩余仓位管理。两者不得混用。

## 跨轮状态：cooldown 注册表和审计学习快照

cooldown 注册表是 V2 的唯一强制交易 cooldown 状态。skill 操作 cooldown 必须通过 `audit-system` CLI（不直接读写 SQLite）：

| 命令 | 用途 | 失败处理 |
| --- | --- | --- |
| `audit cooldowns list` | 拉取所有未过期未 cleared 的 cooldown | 失败即视为 cooldown 不可用，进入"只管理已有仓位"模式 |
| `audit cooldowns check <symbol> <long\|short>` | 候选预检；exit code 2 表示 blocked | blocked=true 时本轮拒绝该 symbol/side 新入场 |
| `audit cooldowns set` | stop / abort / manual_close 后强制写入 | 写入失败时把 cooldown 缺口写进 summary 并阻止后续同 symbol 新入场 |
| `audit cooldowns clear <symbol> [side]` | AI 主动早期解除（manual_clear） | 仅当满足 `V2.txt §四.3` 噪声止损 re-entry watch 或 `V2.txt §四.4` 普通早期解除全部条件才允许 |

cooldown 写入由 skill 在以下事件发生时强制触发：

- 持仓被 SL 成交（不论被动 trigger 还是 migrated SL 触发）：`reason=stop`，默认 30 分钟。
- 噪声止损候选仍写 `reason=stop`，但 cooldown notes 必须包含 `reentry_watch=true`、`stop_classification=noise_stop_candidate`、止损后观察窗口、原始失效位和重入触发条件；普通 stop 不得提前解除。
- 受保护入场任何阶段 abort（SL/TP 已挂但 entry 未成交）：`reason=abort`，默认 15 分钟。
- 主动平仓（非 TP1 成交）：`reason=manual_close`，默认 15 分钟。
- 同 symbol/side 4h 内累计 ≥ 2 次 stop：`reason=stop`、`notes=repeat_stop_within_4h`，时长 60 分钟。
- 同 symbol/side 1h 内累计 ≥ 3 次 abort：`reason=abort`、`notes=repeat_abort`，时长 45 分钟。
- TP（含 TP1 + runner 全平）成交：**不**写 cooldown。

升级时长由 skill 在写入前查询历史 cooldown（`audit cooldowns all`）后判定，并把判定理由写入 cooldown.notes。

审计学习快照是 V2 的非交易 cooldown 跨轮软状态。它只能来自本地审计系统的只读统计，例如 `trading-intel-mcp` 的 `audit_analyze_cycles`、`audit_analyze_trading_decisions`、`audit_get_cycle_digest`，或等价的本地 `audit` 只读输出。学习快照不得直接授权或禁止交易，只能交给 Codex 调整 seed 覆盖、候选优先级、被动计划、执行方式和仓位折扣。硬风控、cooldown、保护同步、经济 R、资金费窗口、三段保护梯和账户 preflight 不得被学习快照放宽。

每轮读取学习快照失败时，必须写 `strategy.learning_snapshot`，payload 标记 `learning_snapshot_unavailable` 和失败原因；本轮继续按保守默认规则运行，但不得声称完成自学习。

## 强制每轮顺序

每一轮必须严格按以下顺序执行。不得跳过后续阶段；如果前置阶段被阻塞，也要继续输出最终总结并记录阻塞原因。每轮开始时生成 `cycle_id`，并优先通过 `audit-system` 写入本地审计事件；审计写入失败不替代交易风控判断，但必须在最终总结中报告缺口。

单轮不得为了等待未来 K 线收盘、未来盘口变化或下一次资金费率时间点而长时间阻塞。需要等待未来确认时，本轮必须按当前数据完成 CTA/风控判断，写明候选观察计划和下一轮触发条件，然后输出 `summary.finalized`；下一轮重新读取 MCP 当前数据后再判断。

1. 重新读取或确认当前 `V2.txt` 规则。
2. 如有需要，发现/加载 `ccxt-mcp` 工具。
3. 生成本轮 `cycle_id`，写入 `cycle.started` 审计事件。
4. **cooldown 复核**：调用 `audit cooldowns list` 获取活跃 cooldown，写入 `cooldown.reviewed` 审计事件（payload 含 active 列表）。CLI 失败时写 `cooldown.unavailable`，本轮禁止新建仓。
5. **学习快照**：读取最近审计学习快照，写入 `strategy.learning_snapshot`。快照至少尝试覆盖最近 50 轮、最近 20 笔可审计策略交易、no-trade 主因、CTA/risk/execution 阻塞原因、被拒候选后验、setup_bucket 表现和执行质量。样本不足时标记 `sample_insufficient=true`。
6. 通过 `ccxt-mcp` 读取账户、持仓、合约普通未成交委托、条件单和保护单，并把工具名、参数摘要、返回摘要、耗时、错误和 payload hash 写入 `mcp.call` 审计事件。
7. 完成持仓/订单/保护单对账：持仓事实只能来自 `positions` 和 balance positions；条件单、algo 单、TP/SL 或 reduce-only 保护单不得反向证明持仓存在。若无对应持仓但存在条件/保护单，必须标记为孤立保护单。
8. 先管理已有持仓：验证保护单、识别漂移，并在考虑新开仓前按 V2 规则处理退出或调整。
9. 通过 `ccxt-mcp` 扫描配置好的 CCXT 合约市场池，优先使用批量和增量调用；把宽市场摘要写入 `market.snapshot`。
10. 基于当前轮 MCP 数据和学习快照完成 V2 要求的市场分析；必须区分市场报告榜单和可执行 seed list。long/short Top 5、24h 涨跌幅榜和极端标的只用于截面报告，不得直接等同于 CTA 候选池；可执行 seed list 必须按 `V2.txt` 的结构位置、二段机会、止损清晰度、目标空间、周期职责、BTC/ETH beta 暴露和成本可执行性筛出，并对 cooldown blocked 的 symbol/side 直接降级为观察。把排名、排除项和 seed list 写入 `candidate.ranked` / `candidate.filtered`。对被拒候选必须写标准化拒绝原因；同一 `symbol+side` 连续重复拒绝时，按 `V2.txt §四.1` 记录候选降频状态、剩余跳过轮数和重新激活条件，但不得把候选降频当作真实交易 cooldown。连续 no-trade 触发后，`candidate.filtered` 还必须写本轮 20-35 个 widened seed 覆盖、至少 5 个 setup_bucket 覆盖缺口，以及 `near_qualified_passive_plan` 列表或不足原因。
11. 对每个排序候选做 V2 交易确认；CTA 阶段必须再做一次 `audit cooldowns check`，blocked=true 的候选只能记为观察。把每个候选的确认结果写入 `cta.decided`，payload 必须包含 `setup_bucket`、`hard_block` / `soft_wait` / `report_only` 分类、标准化拒绝原因、`passive_entry_zone`、`limit_or_ioc_accept_price`、`do_not_chase_price`、是否触发候选降频、是否出现新的 15m 已收盘结构事件，以及需要后续统计的 `rejected_candidate_outcome` 基准字段（拒绝时价格、拒绝原因、后续 MFE/MAE 待更新标记）。`reclaim 未确认` 必须解释为市场 K 线/结构尚未确认，不是人工确认；缺已收盘 reclaim 的近合格候选必须给出下一轮可验证条件或 passive plan，不能向用户请求确认来替代。
12. 对每个可交易候选执行风控和仓位计算；强制校验经济 R 下限（1R ≥ max(成本 3 倍, 0.25 USDT)）、资金费窗口、止损噪声距离、`V2.txt` 定义的当前自动风险上限（含 0.25%-0.5% 观察期和连续正 R 样本要求）和重入半风险约束；把每个候选的仓位、风险收益、成本覆盖、`expected_funding_pnl_usdt`、`economic_r_check`、`noise_stop_gate`、`account_state`、账户模式/positionSide preflight 状态、学习快照导致的软仓位折扣和剔除原因写入 `risk.sized`。
13. 写入 `strategy.learning_applied`，说明本轮采用的 seed 覆盖调整、被动计划、执行方式限制、候选降频/解除、仓位折扣，以及哪些硬门禁未被改变。
14. 如果当前持仓数低于 `V2.txt` 定义的最大持仓上限，按 V2 允许的方式执行符合 cooldown、仓位、风险、成本、盘口和保护边界的新币种，直到候选用完或账户达到持仓上限。不得开重复净方向。
15. 只有在候选通过 `V2.txt` 的 cooldown、仓位、风险、成本、盘口、执行质量、止损噪声距离、beta 集中风险、账户模式 preflight 和保护边界，且真实交易明确启用时，才通过 `ccxt-mcp` 提交入场、退出、撤改或保护动作。新增真实仓位默认必须使用限价、IOC、post-only 不成交即放弃或带价格边界的 marketable limit；`type=market` 新入场只有在同一轮可证明 final order book 到实际提交开始 ≤ 3 秒时才允许，证明不足即禁止。提交前写 `execution.planned`（含 protection 策略：`protected_futures_entry` vs `manual_protection_sequence`，后者必须包含 `manual_protection_sequence_reason`，并包含交易所/账户模式/positionSide/leverage/margin/precision/min-order preflight、`passive_entry_zone`、`limit_or_ioc_accept_price`、`do_not_chase_price`、3 秒内重取盘口时间、计划价到可成交价漂移 R、实际风险相对计划风险倍数、实际 RR、止损噪声门禁、执行方式为何不是默认暂停的 market entry）；dry-run 写 `order.dry_run`，真实提交响应写 `order.submitted`。任何真实 create/cancel/edit/close/set-leverage 等 mutating MCP 调用都必须先有同一 `cycle_id` 下的计划事件，调用返回后必须立即写入真实响应事件。
16. 保护移动、TP1、runner 管理或孤立单清理前，必须先确认持仓、最近成交和保护状态没有因为 TP/SL 触发而变化；同时必须先写 `protection.precheck` 审计事件（payload 含 `current_R_progress`、`current_stage`、`new_sl_distance_atr15m_multiple`、`min_required_R_progress`、`net_be_price`、`new_sl_net_expected_pnl_usdt`、`gate_result`），precheck 不通过则禁止提交 mutating MCP 调用。
17. 对真实入场和主动退出做成交后执行质量复核：写入实际成交均价、成交漂移、滑点/点差/冲击成本占 R、成交后实际 1R、实际 RR、实际成本覆盖、实际最大亏损 USDT 和权益占比。若触发 `slippage_risk_abort`，先按 V2 平掉新增风险并清理孤立保护，再进入 cooldown 写入。
18. **cooldown 写入**：本轮发生 stop、manual_close、受保护入场 abort 或 `slippage_risk_abort` 后，立即在 `post.verify` 之前调用 `audit cooldowns set` 写入对应记录；CLI 返回的 cooldownId 必须写入 `cooldown.written` 审计事件。stop 后必须分类 `structure_invalidated` 或 `noise_stop_candidate`；后者还要写 `reentry_watch` 条件和止损后 15m/30m 后验统计待更新字段。
19. 重新读取执行结果、持仓、合约普通未成交委托和 TP/SL 状态，并写入 `post.verify`。孤立保护单取消返回 unknown/order not found 时，必须重读 positions、普通 open orders 和 open algo orders 后判定是否为 `benign_cleanup_unknown_order`。
20. 输出强制最终每轮总结，写入 `summary.finalized` 审计事件。面向用户的轮末总结必须使用中文段落标题和中文说明，像 V1 一样直接可读；审计 payload 可保留英文键名或枚举值以便机器复盘。无论是不交易、阻塞、dry-run、错误、超时、用户暂停还是用户中断轮次，只要当前会话仍可继续写入审计，都必须输出；中断总结应标记为 `interrupted` 或 `paused`，并说明未完成阶段和真实执行状态。总结必须包含学习快照和软调整、候选降频、拒绝候选后验统计更新状态、执行质量降频/market entry 限制状态，以及下一轮优先验证的策略学习项。若连续 15 轮或 30 分钟无新开仓，必须追加 `no_trade_diagnostic`，列出主阻塞原因、20-35 个 widened seed 覆盖、至少 5 个 setup_bucket、至少 5 个近合格被动计划（不足 5 个时写明缺口）、以及绝不能放宽的硬门禁；只能扩大机会发现和被动限价计划，不得放宽 V2 硬风控。
21. 在 `summary.finalized` 之后等待按配置间隔进入下一轮。**不再运行 verify-v2 语义门禁**；hash chain 校验由 `audit verify <cycle_id>` 按需进行（不阻塞下一轮）。

## MCP 数据流

按以下顺序使用 MCP：

1. `ccxt-mcp` 账户状态：config、balance、positions、margin/leverage、交易所返回的 PnL 字段、合约普通未成交委托、已关闭/已取消订单，以及交易所暴露的条件/保护单。
2. `ccxt-mcp` 行情数据：exchange markets、24h tickers、买一卖一或 order book、funding/mark、open interest 和 candles。
3. 可选免费外部 MCP 覆盖：可用且触发 `references/mcp-data-policy.md` 条件时，可用本地 `trading-intel-mcp` 审计分析、CoinGecko public、DefiLlama public，以及 `ccxt-mcp` Binance futures 公共衍生品情绪工具。
4. Codex 推理：根据 `V2.txt` 推导具体市场解释、交易/不交易判断、仓位、保护/退出方案和策略报告字段。
5. `ccxt-mcp` 执行：只有 V2 明确允许时，才下单、平仓、改单、撤单或修改合约订单。Binance USDT-M 受保护入场必须优先使用 `ccxt_create_protected_futures_entry`（见 §工具纪律）。
6. 再次读取 `ccxt-mcp` 账户状态：复核动作后的账户、持仓、订单和保护状态。

MCP 能力名称和第一波扫描结构见 `references/v2-operating-procedure.md`。
可选外部数据源政策，包括免费优先和付费源排除规则，见 `references/mcp-data-policy.md`。

## 工具纪律

行情和账户扫描必须使用 `ccxt-mcp` 工具。不得用临时本地 shell、Python、REST、网页抓取或文件生成扫描脚本替代 `ccxt-mcp` 调用。

V2 实盘决策轮次中，不得调用 web search、browser search 或通用网页/新闻检索工具。必须先完成必需的 `ccxt-mcp` 账户、订单、保护和行情读取。可选外部背景只能在必需 `ccxt-mcp` 数据足够完成 V2 判断后，通过已经配置好的免费 MCP/数据提供工具查询。如果没有配置好的免费可选源，记录 `optionalDataMissing` 或 `freeOnlySkipped`。

只有在当前 Codex 会话没有暴露原生 MCP 工具时，才允许临时 Node MCP client 作为真实 `ccxt-mcp` server 的 stdio 传输适配器。它必须用显式绝对 `cwd` 启动 `ccxt-mcp/dist/index.js`，`cwd` 指向 `ccxt-mcp` 包目录；数据采集前必须调用 `listTools`，并且只有预期的 `ccxt_` 只读工具存在时才继续。不得从 `process.cwd()` 推导 MCP server cwd。wrapper 不得 import `ccxt`、使用 `fetch`/REST、抓网页，或从文件计算行情；它只能调用 MCP 工具并整理返回 payload。必须维护 `readOnlyToolAllowlist`，并在任何 mutating 工具前中止，例如 `ccxt_create_*`、`ccxt_cancel_*`、`ccxt_edit_*`、`ccxt_set_*`、`ccxt_add_margin`、`ccxt_reduce_margin`、`ccxt_transfer` 或 `ccxt_withdraw`。`ccxt_call` 只能用于明确审阅过的只读 exchange GET 方法，并且每个允许的方法名必须在轮次开始前列出。

不得为实盘轮次创建持久自主 runner。临时适配器必须由当前 Codex 回合掌控，不得包含策略逻辑，并且必须把每个市场判断、风险、执行和总结决策交回 Codex。它不得 sleep-loop 到未来轮次、维护策略状态、追加最终轮次总结，或在候选需要自由裁量审阅后继续运行。

如果越过上述边界，立即停止进程，移除或禁用 runner，审计日志中是否存在 mutating 调用和缺失的 Codex 决策，记录纠正措施，然后只在 Codex 控制的轮次中恢复。

如果缺少必需的 `ccxt-mcp` 行情、账户或执行能力，报告缺失能力并返回阻塞/状态结果。不得静默退回自制扫描器。

任何真实执行前，调用 `ccxt_get_config` 并确认交易所、账户凭据、需要时的代理存在性，以及交易开关状态。如果 `CCXT_ENABLE_TRADING` 不是 true，或 `CCXT_DRY_RUN` 是 true，把执行工具视为模拟，报告 dry-run 结果，不得声称已经真实下单。

**Binance USDT-M 受保护入场必须优先使用 `ccxt_create_protected_futures_entry`**。它是单次原子调用：服务端先创建 close-position 止损和止盈 algo 保护，再提交入场单；任何阶段失败时它会撤销已接受的保护并返回失败阶段。手动的"先创建 SL → 再创建 TP → 再做 final-gate → 再 market entry"序列只允许在以下情形：

- protected_futures_entry 工具不可用或返回不支持的错误。
- V2 计划写明 quantity-based 分层退出（例如部分 TP1 + runner）且 protected_futures_entry 不支持数量化 TP。

任何手动序列必须在 `execution.planned` payload 注明 `manual_protection_sequence_reason`；abort 时必须按 cooldown 写入 `reason=abort`。

真实执行审计必须保持实时性：提交 mutating MCP 调用前，先写 `execution.planned` 或 `action.planned`，payload 必须包含具体工具、symbol、side、amount、price/trigger、positionSide、reduceOnly、final order book 时间、计划价、允许漂移、净保本/经济 R 相关计算，以及账户模式/positionSide/leverage/margin/precision/min-order preflight。调用返回后立即写 `order.submitted`、`action.executed` 或 `action.remediated`，payload 必须包含交易所 orderId/algoId、avgPrice、executedQty、createTime/updateTime/triggerTime、错误码、撤销结果、本地写入时间和成交后风险复核字段。若因中断、网络或工具故障只能事后补录，事件和最终总结必须明确标记 `reconstructed`，写明真实交易所时间与本地补录时间。

真实入场、主动退出、保护移动和 TP1/runner 管理必须携带执行质量字段：1h regime、15m 结构、5m 触发、1m/盘口用途、BTC/ETH beta 暴露、同向 beta 组风险、决策价、最终 bid/ask、final order book 时间、提交时间、允许漂移、预估滑点/点差/冲击成本占 R、实际风险相对计划风险倍数、实际 RR、止损噪声距离。若 final order book 到提交超过 3 秒、成交漂移超过 V2 门槛、计划价到可成交价漂移超过 0.25R、实际风险超过计划风险 1.25 倍、实际 RR 跌破 1.5、止损噪声门禁失败、或同向 beta 组风险不合格，必须停止新增执行或切换为 V2 允许的限价/边界执行。最近 3 笔真实执行中有 2 笔满足 V2 定义的执行质量恶化条件时，后续 5 轮停止新增 market entry，只允许限价/IOC/边界执行或只管理已有仓位，并在 summary 写明恢复条件。

Binance USDT-M 分层退出执行纪律：`closePosition=true` 是 Close-All，只能用于关闭全部当前剩余仓位，不得用于 TP1 或任何部分止盈。TP1 必须是指定数量的 reduce-only 退出；优先使用普通 reduce-only limit，只有当前工具和交易所返回明确支持 quantity-based 条件 TP 且 V2 计划写明数量、用途和互斥关系时，才允许使用数量化 `TAKE_PROFIT_MARKET`。runner 剩余仓位必须在每次 TP1/SL 成交后重新读取真实数量再设置保护。

每一轮都必须从当前 MCP payload 重新计算 V2 要求的合格池、long Top 5、short Top 5 和候选列表。上一轮结果只能作为对比，绝不能作为当前判断的输入或缓存。

第一轮基线后使用增量取数：当工具支持 `since` 或 `limit` 时，为 candles、orders、trades 和 account events 保留按 symbol 的 timestamp/cursor。全市场覆盖仍然必须完成，但要用批量调用和缓存静态 metadata。

优先使用高密度 MCP 调用，而不是零散调用：可用时使用全 symbol 或多 symbol 工具，例如 `ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices`、`ccxt_fetch_open_interests`、`ccxt_fetch_positions` 和订单/账户批量端点。只有 V2 seed list 缩窄后，才按 symbol 扇出读取。

任何 MCP 工具暴露 `maxItems`、`limit`、`pageSize` 或类似数量参数时，必须按当前工具 schema 上限请求；已知市场摘要类 `maxItems` 上限按 50 执行，不得请求 150 或其他超出 schema 的值。

本地 shell 命令只允许用于 repo/config 检查和 `audit-system` 本地审计写入（包括 cooldown CLI），不能用于实盘行情发现。`audit-system` CLI 只能写入本地 JSON 审计事件和 cooldown 记录，不得读取行情、调用交易所或执行交易。如果 repo 检查不可避免地需要本地 Python 命令，使用 `python3`；不要假设存在 `python` alias。

## 三段保护梯硬规则

任何 SL 移动、TP 收紧、trailing 启用、保护 migrate 等 mutating MCP 调用之前，必须先写 `protection.precheck` 审计事件。precheck 与 `V2.txt §八` 表对照：

| 阶段 | R-progress | 允许 | 禁止 |
| --- | --- | --- | --- |
| 早期 | `< 0.5` | 继续原 SL/TP；净值为正的部分减仓 | 任何全仓 SL 向入场方向移动（含保本）、贴现价 trailing |
| 中段 | `0.5 ≤ < 1.0`（TP1 前） | 移到 5m/15m 噪声外结构位，新 SL 距现价 ≥ 1.5 × ATR(15m,14) | 贴现价、贴入场价、ATR 1.5 倍以内 |
| TP1 前高利润 / 趋势跟踪 | `≥ 1.0` 且第一目标临近或已触及前 | 趋势扩展条件成立时优先全仓上移 TP + SL；新 SL 必须在已收盘 15m 结构外且距现价 ≥ 1.5 × ATR(15m,14)；扩展条件不足时执行 TP1 + runner | 只上移 TP 不上移 SL；仅因达到 1R 就把全仓 SL 抬到净保本附近；把 SL 放进普通噪声带；旧 close-all TP 可能触发时先挂新 TP 再撤旧 TP |
| TP1 后 runner | TP1 部分成交后 | 5m/15m 结构、前高/前低、跟踪止盈 | 1m/最新价机械追踪、closePosition=true 做部分退出 |

precheck payload 必填字段：`current_R_progress`、`current_stage`、`new_sl_distance_atr15m_multiple`、`min_required_R_progress`、`net_be_price`、`new_sl_net_expected_pnl_usdt`、`gate_result`（`pass` / `block_early_stage` / `block_atr_too_tight` / `block_net_negative`）。

`gate_result` 不是 `pass` 时，禁止提交对应 mutating MCP 调用。例外（原始失效位被触发、保护缺失、滑点异常、BTC/ETH 极端冲击）必须显式设 `gate_result = override` 并在 payload 写 `early_protection_override_reason`，summary 同步记录。

## 资金费窗口

UTC 00:00/08:00/16:00 前 15 分钟进入资金费窗口。skill 在 risk.sized 阶段自动计算：

- `next_funding_ts` = 下一次结算 UTC 时间
- `seconds_to_funding`
- `expected_funding_pnl_usdt = funding_rate × notional × max(1, time_fraction_held)`

`risk.sized` payload 必须包含 `funding_window_state`（normal / pre_funding_window / post_funding_window）和 `expected_funding_pnl_usdt`。新入场候选若 `seconds_to_funding ≤ 900` 且 `abs(expected_funding_pnl_usdt) > 0.05 × planned_loss_usdt` 且方向不利，本轮拒绝（`gate_result = funding_window_blocked`），输出观察计划。

已有持仓在资金费窗口的额外评估走 `position.management` 决策路径，遵守三段保护梯。

## 连续运行

默认节奏是每 60 秒一个决策轮次，除非用户给出其他间隔。在当前 Codex CLI/session 中持续运行，直到用户停止、新指令改变目标、MCP 工具不可用、cooldown CLI 不可用、或 V2 风控/账户状态要求停止。不要在某一轮内部 sleep 到未来 K 线收盘；把等待条件写入本轮最终总结，并交给下一轮复核。

不要因为某一轮没有交易就停止。`No trade` 是正常的策略决策。

## 硬边界

- `V2.txt` 可用时，不得使用记忆中的阈值。
- MCP 能力缺失时，不得编造行情数据。
- cooldown CLI 不可用时，不得新建仓。
- 不得静默下单；必须先输出 V2 要求的交易计划或执行摘要。
- 如果 V2 要求保护或退出机制，不得在没有对应机制的情况下新增风险敞口。
- 当账户、订单、持仓或保护状态不清楚时，不得声称已满足仓位约束，也不得提交真实执行。
- 不得把审计系统当成交易系统；审计系统只记录本地事件、cooldown 记录和展示复盘，不允许下单、撤单、改仓、转账或提现。
- 不得把条件单、algo 单、TP/SL 或 reduce-only 保护单当作持仓存在的证据；没有对应持仓的保护单是孤立保护单，必须清理或报告阻塞并复核。
- 不得省略最终每轮总结。即使是部分轮次、用户中断或暂停，也必须在会话仍可写审计时输出完整总结，并把缺失字段标记为 unavailable 且说明原因。
- 不得违反三段保护梯：precheck 不通过的 SL 移动 mutating 调用必须放弃。
- 不得绕过 cooldown：blocked symbol/side 在当前轮直接降级为观察，除非 manual_clear 全部条件成立。
- 不得用经济 R 不合格的微型仓位通过审计；1R < 0.25 USDT 的候选必须放弃或重设计。
- 不得请求人工确认来放宽单笔风险百分比；超过 2% 不触发人工确认，必须按 `V2.txt` 的自动门禁决定是否进入 2%-5% 区间；超过当前自动上限时只能自动降仓、缩名义、改入场或拒绝。
- 不再依赖 `audit verify-v2` 语义门禁；它已被删除，hash chain 校验由 `audit verify` 按需进行，不阻塞下一轮。
