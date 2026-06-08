# V1 MCP 运行说明

本文件刻意不重复 `V1.txt`。它只作为工具运行地图。策略阈值、排除条件、风控限制、micro-CTA 规则和策略类报告内容必须在运行时读取 `V1.txt`。

## 必需 MCP 能力

工具未预先加载时，先做工具发现。

`ccxt-mcp` 账户和执行能力：

- 读取 balance、positions、leverage/margin 状态、合约普通未成交委托、交易所暴露的条件/保护单，以及 my trades。
- 按 `V1.txt` 要求提交合约订单。
- 当 `V1.txt` 要求且交易所支持相关 CCXT 方法时，创建或维护 stop loss / take profit / trigger / trailing / reduce-only 保护。
- 仅当 V1 风控处理需要时，才平仓、改单、撤单或替换合约订单。

`ccxt-mcp` 行情能力：

- 合约交易所 markets。
- 24h ticker statistics。
- 买一卖一或 order book 数据。
- 支持时读取 funding、premium、mark-price 和 open-interest 数据。
- `V1.txt` 所需时间周期的 K 线/candles。

如果缺少必需能力，不得伪造步骤。报告缺失能力并停止真实执行。

## 强制轮次结构

每一轮都必须按顺序完成这个状态机：

1. **读取规则**：读取或确认当前 `V1.txt`。
2. **账户/订单/保护预检**：读取 config、balance、positions、合约普通未成交委托、条件/保护单，以及理解当前敞口所需的近期成交。
3. **持仓/订单/保护单对账**：以 positions 和 balance positions 作为持仓事实来源；把条件/保护单按 symbol、positionSide、方向和数量匹配到已有持仓。无对应持仓的条件/保护单必须标记为孤立保护单。
4. **已有持仓动态管理**：验证 SL/TP，按 `V1.txt` 处理必需退出/调整。已有持仓本身不禁止本轮新增开仓；完成已有持仓风险处理后，只要总持仓数、总风险、保证金、普通未成交订单和条件/保护单状态仍满足 `V1.txt`，继续进入全市场覆盖和新机会评估。
5. **全市场覆盖**：刷新全部合格 USDT-M 合约市场池和当前 broad market payload。
6. **截面选择**：用当前轮数据重新计算 eligible pool、setup bucket、long/short/scalp 排名、排除项和排序候选；具体覆盖数量、Top N 和 micro-CTA 候选上限以当前 `V1.txt` 为准。
7. **单主脑决策记录**：当前账户不支持额外模型复核能力，V1 不再要求、尝试、等待或记录该能力。每轮在账户/订单/保护/行情快照形成后，记录 `decisionMode=single_codex_brain` 或等价字段，确认当前 Codex 独立完成交易判断。
8. **micro-CTA 决策**：按 `V1.txt` 判断候选是否可交易；每个候选必须写明做多、做空或放弃。short 候选不默认暂停，但必须逐项检查 `shortExecutionGate` 或兼容旧名 `shortExceptionGate`。
9. **风险仓位**：计算每个候选的 size、leverage、margin impact、最大持仓约束、账户可用性、RR、保护有效性和交易所最小下单要求。short 还必须确认 0.5R squeeze 复核条件、保护复核路径和 AI 失效判断标准清楚。
10. **组合执行列表**：把所有通过门禁且低相关的候选放入 `approvedActions[]`，把未通过候选放入 `rejectedCandidates[]` 并写具体门禁原因。不得只因已有持仓、已选一个最高分候选或本轮已有一个动作而跳过其他合格候选。short 可以放入真实 `approvedActions[]`，但必须通过 `V1.txt` 的 `shortExecutionGate` / `shortExceptionGate` 和全部账户、保护、风险、深度、滑点、动作后复核门禁。
11. **执行和保护**：只允许执行符合 V1 全部硬门禁的新仓或管理动作；新增真实仓位必须带止盈止损。单批最多 3 个新增受保护入场，批次后复核清楚才允许下一批。
12. **动作后复核**：重新读取账户、持仓、合约普通未成交委托和保护单。
13. **最终总结和审计闭环**：写入 `summary.finalized`，输出当前 `V1.txt` 最终总结结构，并报告 hash chain 校验状态或审计不可用原因。

如果某个阶段因数据或工具不可用而无法运行，继续到最终总结并标记明确阻塞原因。不得在总结前静默停止。

不得把临时 MCP 适配器扩展成后台 runner、cron、sleep-loop、持续自动监控器或持久策略状态机。

## 审计运行地图

每轮开始创建 `cycle_id` 并写入 `cycle.started`。随后按实际进度写入账户、对账、扫描、候选、micro-CTA、风控、执行计划、订单/跳过和动作后复核事件。真实下单不是写审计的前提；no-trade、阻塞、dry-run、工具异常和中断都必须落 `summary.finalized`。

`summary.finalized` 必须包含 V1 skill 中列出的必填字段。`plan` 必须支持 `approvedActions[]`、`rejectedCandidates[]`、`remainingPositionSlots`、`portfolioRiskAfterPlan` 和 `batchPlan[]`，`actions` 必须支持多 symbol、多批次和每批次复核。若有 short 候选，payload 必须包含 `shortExecutionGate` 或兼容旧名 `shortExceptionGate`；若真实执行 short，还必须记录 0.5R squeeze 复核条件、AI 失效判断标准和动作后复核。payload 必须包含 `decisionMode=single_codex_brain` 或等价字段。若某个阶段没有产物，payload 中用 `auditGaps` 明确说明缺口、阻塞工具和对交易动作的影响。写入后应调用审计校验能力或读取本地事件链确认 payload hash/event hash 连贯；校验不可用时写明 `hashChainVerification: unavailable` 和原因。

## 第一波市场扫描结构

先使用便宜的 `ccxt-mcp` 调用，再做 K 线密集分析。这里的目标是全市场覆盖不变，只减少逐 symbol 重数据调用：

1. 调用 `ccxt_load_markets`。
2. 支持时调用全 symbol 或多 symbol 批量工具：`ccxt_fetch_tickers`、`ccxt_fetch_funding_rates`、`ccxt_fetch_mark_prices` 和 `ccxt_fetch_open_interests`。
3. 只对缩窄后的 seed symbols 拉取买一卖一或 order book。默认 seed 数 12-15 个；当 near-pass 候选多、long/short 两侧都有质量候选或市场分散度高时，可以扩展到 16-20 个；20 个是重数据上限。
4. 只对 seed symbols 拉 candles、recent trades/taker 明细、深度覆盖和精细 RR/滑点计算。轻量层已足够硬拒绝的极端高涨跌、低流动性、宽 spread、尾端 flush 或无结构止损候选，不必再拉完整重数据。
5. 只使用当前 `V1.txt` 中的规则构建 eligible universe。
6. 由 Codex 按 `V1.txt` 从 MCP payload 计算 V1 超级短线指标，并输出 setup bucket、long/short/scalp 排名、排除项和排序候选；若使用 `ccxt_fetch_ticker_summary`，`maxItems` 必须设置到工具允许的最高值或至少覆盖 `V1.txt` 要求的候选数量。
7. 进入计划阶段前，必须先保留多候选上下文；最终只交易 1 个或 0 个 symbol 时，要能从 `rejectedCandidates[]` 复核其他候选的硬阻塞原因。short 候选必须保留具体 `shortExecutionGate` / `shortExceptionGate` 通过或失败原因。
8. 每轮记录 `phaseTiming` 或等价阶段耗时；重点记录账户预检、对账到 market.scanned、market.scanned 到 CTA、执行事件到 post-review、总耗时。该字段用于验证两层扫描是否真正提速。

除 `V1.txt` 明确给出的 seed 数规则外，不要在这里硬编码策略阈值。如果 `V1.txt` 修改阈值，下一轮必须遵循新文本。

不得通过创建或运行本地扫描脚本实现这个扫描。扫描输入必须来自 MCP 行情调用。Codex 可以在推理中计算已经返回的 MCP payload 排名，但不得用本地 Python、shell、REST 或抓取代码替代缺失的 MCP 数据。

## 执行结构

任何真实订单 MCP 调用前：

1. 输出 `V1.txt` 要求的完整交易计划，包含 `approvedActions[]`、`rejectedCandidates[]`、剩余仓位槽位、组合风险和批次计划。
2. 确认 account、positions、合约普通未成交委托和 conditional orders 均已成功读取。
3. 确认已有持仓处理已完成。
4. 确认订单 payload 能映射到选定的 `ccxt-mcp` 执行工具。
5. 确认包含 stop loss 和 take profit。
6. 检查 `V1.txt` 最大持仓、单批新增入场上限、组合风险和剩余仓位槽位。
7. 检查杠杆、名义、最大亏损、保证金占用和交易所最小下单约束；多个候选分别通过时，不得只提交最高分一个，除非其他候选有明确硬阻塞。
8. 如果计划包含 short，必须先确认 `shortExecutionGate` 或 `shortExceptionGate` 全部通过、0.5R squeeze 复核条件、保护复核路径和 AI 失效判断标准会写入审计；否则不得提交真实 short。

任何执行 MCP 调用后：

1. 记录后端响应和可用的 order id。
2. 重新读取账户快照、positions、balance positions、合约普通未成交委托、open algo orders 和最近 closed orders/trades。
3. 验证持仓状态、成交均价和手续费。
4. 验证止损止盈保护。
5. 验证是否出现无对应持仓的残留条件/保护单。
6. 如果交易后保护缺失、不匹配、孤立或不清楚，按 `V1.txt` 处理风险并暂停新增执行。

no-trade 或 observe-only 轮次使用轻量 post-review：只确认 balance、positions、open orders、open algo/protection orders 仍可读且为空；不需要执行真实下单后的成交、手续费、SL/TP 匹配深复核。若账户/订单/保护状态不清楚，立即升级为完整复核并把耗时写入 `phaseTiming.slowStages[]`。
