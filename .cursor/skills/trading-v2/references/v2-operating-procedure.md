# V2 MCP 运行说明

本文件刻意不重复 `V2.txt`。它只作为工具运行地图。策略阈值、排除条件、风控限制、CTA 规则和策略类报告内容必须在运行时读取 `V2.txt`。循环顺序、MCP 取数纪律、cooldown CLI 调用、执行复核和最终总结框架由本文件定义。

## 必需 MCP 能力

工具未预先加载时，先做工具发现。

`ccxt-mcp` 账户和执行能力：

- 读取 balance、positions、leverage/margin 状态、合约普通未成交委托、交易所暴露的条件/保护单，以及 my trades。
- 按 `V2.txt` 要求的参数提交合约订单。**Binance USDT-M 受保护入场必须优先用 `ccxt_create_protected_futures_entry`**（单次原子调用，先挂 close-position SL/TP algo 再提交入场，任何阶段失败时回滚已挂保护）。
- 当 `V2.txt` 要求且交易所支持相关 CCXT 方法时，创建或维护 stop loss / take profit / trigger / trailing / reduce-only 保护。
- 仅当 V2 风控处理需要时，才平仓、改单、撤单或替换合约订单。

`ccxt-mcp` 行情能力：

- 合约交易所 markets。
- 24h ticker statistics。
- 买一卖一或 order book 数据。
- 支持时读取 funding、premium、mark-price 和 open-interest 数据。
- `V2.txt` 所需时间周期的 K 线/candles。

如果缺少必需能力，不得伪造步骤。报告缺失能力并停止真实执行。

`audit-system` CLI（不调用交易所、不读行情）：

- `audit append`：写入策略事件。
- `audit verify <cycle_id>`：按需做 hash chain 校验（不阻塞下一轮）。
- `audit cooldowns list / check / set / clear / all`：cooldown 注册表读写。skill 强制使用这套命令；不允许直接 SQLite 写入。

可选外部 MCP 覆盖由 `mcp-data-policy.md` 管理，且只在该文件的触发条件满足后查询。除非 `V2.txt` 明确要求，否则它们不是实盘执行的必需能力。

不要在实盘轮次里用 web search 或 browser lookup 满足可选背景好奇心。缺失的可选背景只记录在数据台账中；它不得在账户、订单、保护和必需行情预检前触发通用网页/新闻搜索。

## 强制轮次结构

每一轮都必须按顺序完成这个状态机：

1. **审计初始化**：生成 `cycle_id`，通过 `audit-system` 写入 `cycle.started`；如果审计不可用，记录缺口并继续轮次。
2. **cooldown 复核**：调用 `audit cooldowns list`，把活跃 cooldown 写入 `cooldown.reviewed` 事件 payload。CLI 失败时写 `cooldown.unavailable`，本轮禁止任何新建仓 MCP 调用；只允许已有持仓管理。
3. **账户/订单/保护预检**：`ccxt_get_config`、balance、positions、合约普通未成交委托、条件/保护单，以及理解当前敞口所需的近期成交；每个 MCP 调用写 `mcp.call`。
4. **持仓/订单/保护单对账**：以 positions 和 balance positions 作为持仓事实来源；把条件/保护单按 symbol、positionSide、方向和数量匹配到已有持仓。无对应持仓的条件/保护单必须标记为孤立保护单，先取消或按 V2 风控处理；复核清零前只限制受影响的 symbol/side，或在影响总敞口时限制新增执行。
5. **已有持仓动态管理**：验证 SL/TP，按 `V2.txt` 处理必需退出/调整；任何 SL 移动/收紧/migrate 前必须先写 `protection.precheck`（见下文 §protection.precheck）。
6. **全市场覆盖**：刷新配置好的合约市场池和当前 broad market payload，并写 `market.snapshot`。
7. **截面选择**：用当前轮数据重新计算 eligible pool、long Top 5、short Top 5、排除项和排序候选，并写 `candidate.ranked` / `candidate.filtered`。candidate.filtered payload 必须包含每个候选的 `cooldown_state`（active/clear/blocked + remaining_seconds）、标准化拒绝原因、候选降频状态、连续拒绝次数、剩余跳过轮数和重新激活条件。
8. **CTA 决策**：按 `V2.txt` 判断候选是否可交易；CTA 阶段必须再次对每个候选 `audit cooldowns check`，blocked=true 的候选只能记为观察。每个候选写 `cta.decided`，并记录是否出现新的 15m 已收盘结构事件、是否解除候选降频、拒绝时价格和后续 `rejected_candidate_outcome` 待更新标记。
9. **风险仓位**：计算每个候选的 size、leverage、margin impact、最大持仓约束、账户可用性、RR、保护有效性、`expected_funding_pnl_usdt`、`economic_r_check`、`account_state` 和账户模式/positionSide preflight，并写 `risk.sized`。经济 R 下限（1R ≥ max(成本 3 倍, 0.25 USDT)）、资金费窗口（见下文 §funding window）和 Binance USDT-M hedge/one-way positionSide 一致性在此阶段硬校验。
10. **执行和保护**：只要当前持仓数低于 `V2.txt` 最大持仓上限，按排名顺序开符合 cooldown、CTA、仓位、账户模式、positionSide、盘口和保护约束的新 symbol，直到达到上限或候选用完；提交前写 `execution.planned`（含 `protection_path`: `protected_futures_entry` 或 `manual_protection_sequence`，后者必须含 `manual_protection_sequence_reason`，以及 exchange/account/leverage/margin/precision/min-order preflight），dry-run 写 `order.dry_run`，真实响应写 `order.submitted`。
11. **成交后执行质量复核**：真实入场和主动退出后立即复核实际成交均价、成交漂移、滑点/点差/冲击成本占 R、成交后实际 1R、实际 RR、实际成本覆盖、实际最大亏损 USDT 和权益占比。若触发 `slippage_risk_abort`，先用 reduce-only/正确 positionSide 平掉新增风险并清理孤立保护单，再写 abort cooldown。
12. **cooldown 写入**：本轮发生 stop / abort / manual_close / `slippage_risk_abort` 时，立刻调 `audit cooldowns set`，并把返回的 cooldownId 写入 `cooldown.written`。
13. **动作后复核**：重新读取账户、持仓、合约普通未成交委托和保护单，并写 `post.verify`。孤立保护单取消返回 unknown/order not found 时，必须通过重新读取 positions、普通 open orders 和 open algo orders 判定是否已清零；已清零时记录 `benign_cleanup_unknown_order`，未清零时继续清理或报告阻塞。
14. **最终总结**：输出下方完整总结契约，并写 `summary.finalized`。总结必须覆盖候选降频、拒绝候选后验统计更新状态、执行质量降频/market entry 限制状态和下一轮优先验证的策略学习项。若连续 15 轮或 30 分钟无新开仓，追加 `no_trade_diagnostic`：主阻塞原因分布、近合格候选、可用被动限价计划、以及不能放宽的硬门禁。
15. **进入下一轮等待**。不再运行任何 V2 语义门禁（verify-v2 已删除）；hash chain 校验由 `audit verify` 按需运行，不阻塞下一轮。

如果某个阶段因数据或工具不可用而无法运行，继续到最终总结并标记明确阻塞原因。不得在总结前静默停止。

## protection.precheck 事件

任何 SL 移动、TP 收紧、trailing 启用、保护 migrate 等 mutating MCP 调用之前必须先写 `protection.precheck`。三段保护梯阶段判定：

| 阶段 | R-progress | 允许 | 禁止 |
| --- | --- | --- | --- |
| early | `< 0.5` | 继续原 SL/TP；净值为正的部分减仓；等待 5m/15m 已收盘结构 | 任何全仓 SL 向入场方向移动（含保本）、贴现价 trailing |
| mid | `0.5 ≤ < 1.0` | 移到 5m/15m 噪声外结构位，新 SL 距现价 ≥ 1.5 × ATR(15m,14) | 贴现价、贴入场价、新 SL 落在 ATR(15m,14) × 1.5 以内 |
| high_profit_pre_tp1 | `≥ 1.0` 但 TP1 未成交 | 只能在新的已收盘 15m 结构外、且新 SL 距现价 ≥ 1.5 × ATR(15m,14) 时移动；优先执行 TP1 | 仅因达到 1R 就把全仓 SL 抬到净保本附近；把 SL 放进普通噪声带 |
| runner | TP1 部分成交后 | 5m/15m 结构、前低/前高、跟踪止盈 | 1m/最新价机械追踪、用 closePosition=true 做部分退出 |

`R_progress`（多单）= `(current_price − entry) / (entry − planned_stop)`；空单方向相反。

`protection.precheck` payload 必填字段：

```text
{
  "symbol": string,
  "side": "long" | "short",
  "current_R_progress": number,
  "current_stage": "early" | "mid" | "high_profit_pre_tp1" | "runner",
  "new_sl_distance_atr15m_multiple": number,
  "min_required_R_progress": number,
  "net_be_price": number,
  "new_sl_net_expected_pnl_usdt": number,
  "gate_result": "pass" | "block_early_stage" | "block_atr_too_tight" | "block_net_negative" | "override",
  "early_protection_override_reason": string | null
}
```

`gate_result` 不是 `pass` 或 `override` 时，禁止提交对应 mutating MCP 调用。`override` 仅在原始失效位被触发、保护缺失、滑点异常或 BTC/ETH 极端冲击时允许，并必须在 `early_protection_override_reason` 写明，summary 同步记录。

## funding window 校验

Binance USDT-M 资金费时间：UTC 00:00 / 08:00 / 16:00。`risk.sized` payload 必须包含：

```text
{
  "funding_window_state": "normal" | "pre_funding_window" | "post_funding_window",
  "seconds_to_funding": number,
  "next_funding_ts": ISO8601,
  "expected_funding_pnl_usdt": number,
  "funding_direction_favorable": boolean,
  "gate_result": "pass" | "funding_window_blocked"
}
```

`seconds_to_funding ≤ 900` 且方向不利且 `abs(expected_funding_pnl_usdt) > 0.05 × planned_loss_usdt` 时，候选必须 `funding_window_blocked`，本轮拒绝新入场，输出观察计划，下一轮重新评估。

已有持仓在资金费窗口的处置走 `position.management` 路径，遵守 protection.precheck 同样的三段梯。

## cooldown 写入触发

skill 必须在以下事件发生时立即写 cooldown（在 `post.verify` 之前）：

| 事件 | reason | 默认时长 | 升级条件 |
| --- | --- | --- | --- |
| 被动 SL 成交 / migrated SL 触发 | `stop` | 30 min | 同 symbol/side 4h 内累计 ≥ 2 次 → 60 min，notes=`repeat_stop_within_4h` |
| 噪声止损候选 | `stop` + notes | 30 min | notes 必须含 `reentry_watch=true`、`stop_classification=noise_stop_candidate`、原始失效位、观察窗口和重入触发条件；仅按 `V2.txt §四.3` 允许 manual_clear |
| 受保护入场 abort（SL/TP 已挂但 entry 未成交） | `abort` | 15 min | 同 symbol/side 1h 内累计 ≥ 3 次 → 45 min，notes=`repeat_abort` |
| 主动平仓（非 TP1 成交） | `manual_close` | 15 min | — |
| TP / TP1 成交 | — | — | **不写 cooldown**（runner 仍属原逻辑延续） |

升级判定由 skill 在写入前查询 `audit cooldowns all` 后决定。每条 cooldown.set 调用必须把判定理由（包括最近 N 次相关 cooldown 的 cooldownId）写入 `cooldown.written` audit event。

cooldown.set 失败必须在 summary 报告，并把该 symbol/side 后续入场视为 blocked 直到 CLI 恢复。

## 第一波市场扫描结构

先使用便宜的 `ccxt-mcp` 调用，再做 K 线密集分析。保持全市场覆盖，但第一轮基线后每轮改用增量方式：

1. 调用 `ccxt_load_markets`。
2. 支持时调用全 symbol 或多 symbol 批量工具：`ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices` 和 `ccxt_fetch_open_interests`。
   如果工具 schema 暴露 `maxItems`、`limit`、`pageSize` 或类似数量参数，按 schema 上限请求；已知市场摘要类 `maxItems` 上限按 50 执行，不得请求 150。需要更宽覆盖时，拆成允许范围内的批次或先用宽摘要后再对 seed symbols 深挖。
3. 除非 symbol/listing 状态变化，否则复用上一轮缓存的静态 market metadata。
4. 当没有全 symbol order book 数据时，只对缩窄后的 seed symbols 拉取买一卖一或 order book。
5. 只对 seed symbols 用 `since`/`limit` 增量拉 candles。不得每轮重新下载完整 K 线历史。
6. 只使用当前 `V2.txt` 中的规则构建 eligible universe。
7. 按 `V2.txt` 要求，用相对强势、相对弱势和流动性领先者构建更小的 seed list。
8. 由 Codex 按 `V2.txt` 从 MCP payload 计算 V2 指标，并输出 long Top 5、short Top 5、排除项和排序候选。

不要在这里硬编码数字阈值。如果 `V2.txt` 修改阈值，下一轮必须遵循新文本。

不得通过创建或运行本地扫描脚本实现这个扫描。扫描输入必须来自 MCP 行情调用。Codex 可以在推理中计算已经返回的 MCP payload 排名，但不得用本地 Python、shell、REST 或抓取代码替代缺失的 MCP 数据。

如果原生 MCP 工具不可用并使用临时 Node MCP client wrapper，它只能作为 `ccxt-mcp` 的传输适配器，不能作为行情源。server 必须用绝对 package path 配置，例如 `cwd: "/home/adon/codes/codex-binance-agent/ccxt-mcp"` 和 `args: ["/home/adon/codes/codex-binance-agent/ccxt-mcp/dist/index.js"]`。实盘读取时不得从 `process.cwd()` 设置 MCP server cwd。任何数据调用前，先用 `listTools` 握手，确认必需只读工具存在，例如 `ccxt_get_config`、`ccxt_fetch_balance`、`ccxt_fetch_positions`、`ccxt_fetch_open_orders`、`ccxt_load_markets`、`ccxt_fetch_tickers`、`ccxt_fetch_funding_rates` 和 `ccxt_fetch_ohlcv`；并强制 `readOnlyToolAllowlist` 拒绝 mutating 工具，包括 `ccxt_create_*`、`ccxt_cancel_*`、`ccxt_edit_*`、`ccxt_set_*`、margin、transfer 和 withdraw 工具。`ccxt_call` 只能用于明确审阅过的只读 exchange GET 方法，例如 Binance open-algo-order 读取，并且每个允许的 raw method 必须在轮次台账中命名后再调用。

不得把上一轮 Top 5 排名复用为当前轮结果。如果报告与上一轮比较，应写成"本轮已从当前 MCP 数据重新计算；与上一轮 Top5 重合：..."。避免使用"延续上一轮 Top5"之类措辞。

## 执行结构

任何真实订单 MCP 调用前：

1. 输出 `V2.txt` 要求的完整交易计划。
2. 确认 account、positions、合约普通未成交委托和 conditional orders 均已成功读取。
3. 确认 cooldown 注册表已读取，且当前候选未 blocked。
4. 确认已有持仓处理已完成。
5. 确认订单 payload 能映射到选定的 `ccxt-mcp` 执行工具。Binance USDT-M 必须优先 `ccxt_create_protected_futures_entry`；任何手动序列必须含 `manual_protection_sequence_reason`。
6. 当 `V2.txt` 要求时，确认已包含 stop loss 和 take profit。
7. 检查 `V2.txt` 最大持仓约束：如果当前持仓数已经达到或超过上限，不提交新增执行。
8. 对新开仓、保护移动、减仓、平仓、撤单和改杠杆等 mutating 动作，先写入同一 `cycle_id` 下的 `execution.planned` 或 `action.planned`。事件 payload 必须包含工具名、symbol、方向、数量、计划价、触发价、positionSide、reduceOnly、final order book 时间、允许最大价格漂移、计划价到可成交价漂移 R、实际风险相对计划风险倍数、实际 RR、止损噪声门禁、净保本/经济 R 计算摘要和放弃条件。
9. 对已有持仓做保护移动、TP1、runner 管理、主动减仓、主动平仓或孤立单清理前，必须重新读取 positions、balance positions、合约普通未成交委托、open algo orders、最近 closed orders/trades 和最新盘口。状态时间距 mutating 提交不得超过 3 秒；若发现 TP/SL 已成交、仓位数量变化、仓位全平或保护单孤立，必须先进入成交后对账和孤立单清理，不得继续用旧持仓提交新保护。
10. SL/TP 移动 mutating 前必须先写 `protection.precheck`（见 §protection.precheck）。

Binance USDT-M 新开仓必须优先使用 `ccxt_create_protected_futures_entry` 提交 protected entry。该工具会先创建 close-position 止损和止盈 algo 保护单，再提交入场单；如果保护或入场失败，工具会撤销已接受保护并返回失败阶段。不要把 `ccxt_create_order_with_take_profit_and_stop_loss` 当作 Binance USDT-M 的首选路径；服务端虽会把该 bracket 调用改路由到 protected entry，但 V2 执行计划和审计里应直接写明 `ccxt_create_protected_futures_entry`。

protected_futures_entry abort（保护已挂但 entry 未成交）必须按 §cooldown 写入触发 `reason=abort` cooldown。

Binance USDT-M 分层退出不得使用 `closePosition=true` 做 TP1。`closePosition=true` 只表示 Close-All，用于关闭全部当前剩余仓位；TP1、部分减仓和 runner 部分退出必须指定数量并使用 reduce-only。优先用普通 reduce-only limit 作为 TP1；只有当前工具和交易所返回明确支持 quantity-based `TAKE_PROFIT_MARKET`，且计划中写明 TP1 数量、runner 数量、互斥关系和孤立单清理方式，才允许使用数量化条件 TP。不得假设多个同向 close-all 条件单可以安全共存。

### 账户模式和 positionSide preflight

每次真实新增风险前，`execution.planned` 或对应 `risk.sized` payload 必须包含：

```text
{
  "exchange": "binanceusdm" | string,
  "default_type": "future" | string,
  "trading_enabled": boolean,
  "dry_run": boolean,
  "position_mode": "one_way" | "hedge" | "unknown",
  "planned_position_side": "BOTH" | "LONG" | "SHORT",
  "leverage": number,
  "margin_mode": string,
  "leverage_bracket_checked": boolean,
  "amount_precision": number | string,
  "price_precision": number | string,
  "min_order_amount": number | string,
  "gate_result": "pass" | "blocked_preflight_unavailable" | "blocked_position_side_mismatch" | "blocked_not_usdt_m_futures" | "blocked_trading_disabled" | "blocked_dry_run"
}
```

Binance hedge-mode 账户不得使用 `positionSide=BOTH` 提交受保护入场；必须使用与计划一致的 `LONG` 或 `SHORT`。preflight 缺失、冲突或返回不明时，本轮只允许管理已有持仓，不得新增真实风险。

### 执行质量复核矩阵

每次 `execution.planned`、`action.planned`、`order.submitted`、`action.executed`、`post.verify` 和 `summary.finalized` 都必须复核以下矩阵，并把结果写入 `execution_quality_gates`：

| 问题 | 必填证据 | 失败处理 |
| --- | --- | --- |
| 周期噪声 | 1h regime、15m 结构/失效位、5m 已收盘触发、1m/盘口用途 | 1h/15m 结构不清时不交易；1m 或未收盘 K 线只能预警和定价，不能开仓/平仓/移动保护 |
| 执行慢半拍 | 决策时间、final order book 时间、提交时间、latency seconds、计划价到可成交价漂移 R | 超过 3 秒重读盘口；漂移超过 0.25R、实际风险超过计划风险 1.25 倍或实际 RR 跌破 1.5 时改限价/边界执行或放弃，不用 market 追价 |
| 滑点大 | bid/ask、计划名义下累计深度、预估点差/滑点/冲击成本占 R、实际成交漂移、actual_vs_planned_risk_multiple | 成本超过 V2 默认门槛降级，超过 V2 极限门槛放弃或成交后风险复核；若 RR/成本覆盖/实际最大亏损/止损噪声距离失效，减仓或平仓 |
| 成交后风险超限 | 实际成交均价、原始止损、实际 1R、实际 RR、实际最大亏损 USDT、权益占比、risk.sized 允许亏损 | 触发 V2 `slippage_risk_abort` 时，平掉新增风险、清理孤立保护、写 abort cooldown |
| 账户模式 | exchange/defaultType、live/dry-run、position mode、planned positionSide、leverage/margin mode、precision/min order | preflight 不明或 positionSide 冲突时不新增真实风险 |
| 止损噪声 | atr15m、stop_distance_atr15m_multiple、最近 3 根 5m K 线影线/实体、noise_stop_gate | 新开仓止损低于 1.2×ATR15m 禁止；高波动/扫单标的低于 1.5×ATR15m 禁止 |
| 保护太早 | 当前 R、保护梯阶段、候选结构位、净保本价、保护位是否在 5m/15m 噪声外 | 0-0.5R 不贴身移动全仓保护；0.5R-TP1 只移到结构位；达到 1R 但 TP1 未成交时不得仅因保本抬全仓 SL；TP1 后 runner 才按结构移动/跟踪 |
| BTC/ETH beta 冲击 | beta group key、同向组仓位数、同向组合计最大亏损、BTC/ETH 15m/1h 状态 | 同向 beta 拥挤时降权、减仓或拒绝新增；BTC/ETH 快速逆风时同组上限收紧并降低风险预算 |
| 资金费窗口 | funding_window_state、seconds_to_funding、expected_funding_pnl_usdt、funding_direction_favorable | seconds_to_funding ≤ 900 且方向不利且超过 0.05×planned_loss 时拒绝新入场 |
| cooldown 阻塞 | cooldown_state、remaining_seconds、reason | blocked=true 时拒绝新入场；只能进入观察 |
| 经济 R 下限 | r_usdt、min_required_r_usdt、fee_cost_usdt、slippage_usdt | r_usdt < max(成本×3, 0.25) 时跳过候选 |

`execution_quality_gates` payload 字段名（snake_case）：

```text
{
  "timeframe_roles": string,
  "latency_seconds": number | string,
  "planned_vs_executable_drift_r": number | string,
  "spread_slippage_impact_r": number | string,
  "post_fill_actual_drift_r": number | string,
  "post_fill_actual_r_usdt": number | string,
  "post_fill_actual_rr": number | string,
  "actual_vs_planned_risk_multiple": number | string,
  "stop_distance_atr15m_multiple": number | string,
  "noise_stop_gate": "pass" | "blocked_too_tight" | "not_applicable",
  "post_fill_max_loss_usdt": number | string,
  "post_fill_max_loss_pct_equity": number | string,
  "cost_coverage_multiple": number | string,
  "account_preflight_result": string,
  "position_mode": "one_way" | "hedge" | "unknown" | "not_applicable",
  "planned_position_side": "BOTH" | "LONG" | "SHORT" | "not_applicable",
  "early_protection_stage": "early" | "mid" | "runner" | "flat" | "not_applicable_no_position",
  "beta_group_key": string,
  "beta_group_position_count": number,
  "beta_group_max_loss_pct_equity": number,
  "funding_window_state": "normal" | "pre_funding_window" | "post_funding_window",
  "cooldown_state": "clear" | "active_other_side" | "blocked",
  "economic_r_check": "pass" | "fail_below_floor" | "not_applicable_no_trade",
  "gate_result": "pass" | "no_trade" | "blocked_by_cooldown" | "blocked_by_funding" | "blocked_by_economic_r" | "blocked_by_noise_stop_gate" | "blocked_by_protection_ladder" | "blocked_by_account_preflight" | "execution_quality_degraded" | "slippage_risk_abort"
}
```

非 Binance USDT-M 交易所才优先使用交易所支持的一体化保护订单工具，例如 `ccxt_create_order_with_take_profit_and_stop_loss`。否则使用交易所暴露的显式条件单工具提交入场和保护。

任何执行 MCP 调用后：

1. 记录后端响应和可用的 order id。
2. 立即写入 `order.submitted`、`action.executed` 或 `action.remediated`，不得等到轮次结束再集中补写。payload 必须包含交易所 orderId/algoId、clientOrderId/clientAlgoId、avgPrice、executedQty、triggerPrice、createTime/updateTime/triggerTime、错误码、撤销结果、本地写入时间和 payload hash。
3. 触发了 stop / abort / manual_close / `slippage_risk_abort` 的事件，调 `audit cooldowns set` 并写 `cooldown.written`。stop 必须额外写 `stop_classification`（`structure_invalidated` / `noise_stop_candidate` / `unknown`）；`noise_stop_candidate` 必须写 `reentry_watch=true`、观察窗口、重入触发条件和后验 MFE/MAE 待更新字段。
4. 重新读取账户快照、positions、balance positions、合约普通未成交委托、open algo orders 和最近 closed orders/trades。
5. 验证持仓状态，包括 TP1 后剩余 runner 数量、全仓 TP/SL 后 flat 状态、成交均价和手续费。
6. 验证止损止盈保护；如果 TP1 已成交，按真实剩余数量重算 runner 保护，不得沿用原始全仓数量。
7. 验证是否出现无对应持仓的残留条件/保护单；如果出现，先取消或按 `V2.txt` 处理风险，并再次读取账户、持仓、合约普通未成交委托和保护单。
8. 如果交易后保护缺失、不匹配、孤立或不清楚，按 `V2.txt` 处理风险；只限制受影响的 symbol/side，或在无法确认总仓位约束时暂停真实执行。
9. 如果动作已经发生但审计只能事后补录，事件 tags 或 payload 必须明确写 `reconstructed: true`，summary 必须写明"事后补录"，并记录交易所真实时间和本地补录时间。

## 强制最终总结

每一轮都必须以完整总结结束。不得因为不交易、阻塞、dry-run、部分数据或错误而省略。使用以下结构，并明确标记 unavailable 字段：

- **Cycle**：timestamp、cadence、V2 source path/status、exchange、live/dry-run state。
- **Audit**：cycle_id、audit data dir、audit write status、hash chain status（可选 `audit verify` 结果）、missing audit stages。
- **Cooldown**：active list（symbol、side、reason、remaining_seconds、source_cycle_id、stop_classification、reentry_watch、reentry_trigger）、cycle 内新写入 cooldown 列表、cycle 内 manual_clear 列表（含 override_reason）、cooldown CLI errors。
- **Data acquisition**：account、positions、合约普通未成交委托、conditional/protection orders、market batch calls、使用的 incremental cursors、missing data 和 rate-limit/API issues。
- **Account and exposure**：可用的 equity/balance 字段、当前持仓数、距离 V2 最大持仓上限的剩余名额、margin/leverage state、`account_state`（normal / constrained_by_specific_gate）、已有持仓管理动作。
- **Market scan**：full-universe size、eligible count、exclusions、seed list size、long Top 5、short Top 5，以及排名是否从当前轮数据重新计算。
- **CTA and candidates**：每个被考虑的排序候选、CTA pass/fail、veto/downrank context，以及被拒绝时的明确 no-trade reason（含 `cooldown_blocked` / `funding_window_blocked` / `economic_r_blocked` / `protection_ladder_blocked` / `execution_quality_degraded`）。列出候选降频列表、连续拒绝次数、剩余跳过轮数、重新激活条件和本轮 `rejected_candidate_outcome` 更新状态。
- **Risk and sizing**：每个候选的 risk、stop distance、stop-distance ATR multiple、noise-stop gate、target、RR、size、leverage/margin impact、`r_usdt`、`economic_r_check`、`expected_funding_pnl_usdt`、`funding_window_state`、`account_state`、账户模式/positionSide preflight 和 position-cap decision。
- **Execution**：live/dry-run action、entry orders、protection orders、order ids/responses、failed execution calls、`execution_quality_gates` 矩阵结果、`protection_path`（protected_futures_entry / manual_protection_sequence + reason），以及 SL/TP 是否同步。真实成交时列出 post-fill actual drift、actual 1R、actual RR、actual-vs-planned risk multiple、stop-distance ATR multiple、noise-stop gate、actual max loss、是否触发 `slippage_risk_abort`、最近 3 笔执行质量和 market entry 降频状态。
- **Post-action verification**：最终 positions、合约普通未成交委托、conditional/protection orders、孤立保护单检查、unknown/order-not-found 清理复核结果、unresolved risks、下一轮候选级执行资格。
- **Strategy learning**：本轮可量化学习项，包括被拒候选后验统计是否需要更新、执行质量是否恶化、是否触发候选降频、是否触发 market entry 降频、下一轮哪些规则需要优先验证。
- **No-trade diagnostic**：仅在连续 15 轮或 30 分钟无新开仓时必填；列出主阻塞原因分布、近合格候选、可用被动限价/IOC 计划和不得放宽的硬风控。该字段不得把硬门禁失败的候选升级为交易。
- **Next cycle**：下一次运行时间、需要带到下一轮的 cursors/timestamps、活跃 cooldown 到期时间，以及如果循环应停止时的明确 stop reason。

## 状态报告

状态请求只总结当前轮，不重述所有 V2 规则：

- 账户预检结果。
- 审计状态：cycle_id、审计落盘路径、hash chain 是否连续，以及缺失事件。
- cooldown 注册表状态：活跃数、本轮新增、本轮 manual_clear、CLI 是否可用。
- 已有持仓审查。
- 候选级新开仓资格：哪些候选允许执行、哪些候选因 cooldown / CTA / 仓位 / 风险 / 保护 / 数据原因跳过，并给出明确原因。
- 市场扫描状态和候选数量。
- 可用时输出 long/short Top 5，并标记为从本轮 MCP payload 重新计算。
- 上一轮重合只能作为对比字段，不能作为当前排名来源。
- 最终候选或未执行原因。如果没有新开仓，区分无候选、CTA 拒绝、cooldown 阻塞、funding 窗口阻塞、经济 R 不合格、protection ladder 不合格、仓位/风险/保护硬约束不通过、市场环境弱，或已有敞口已经足够。
- V2 候选级硬约束的明确阻塞项。
- 任何 MCP 执行结果。
- 动作后保护状态。
- 下一轮时间或停止原因。
