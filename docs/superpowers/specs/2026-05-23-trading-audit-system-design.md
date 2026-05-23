# Trading Audit System Design

## 目标

构建一个独立的交易审计系统，让每一轮 V2/V3 或未来策略决策都可以从账户预检、MCP 取数、AI 分析、决策意图、仓位/风险计算、执行计划、下单响应、动作后复核到最终总结进行全链路溯源。系统必须保存结构化数据、原始 payload、哈希链和人工复盘备注，并提供只读为主的前端界面用于查看每轮详细过程。

## 当前缺口

当前仓库只有 `ccxt-mcp` 工具、`V2.txt` 策略和 `.cursor/skills/trading-v2` 运行规程。`state/` 目录为空，没有 JSONL、SQLite、审计日志或前端系统。交易所历史工具可以查询订单、成交、账本，但不能还原当轮 Codex 看到的 MCP payload、候选排序、CTA 判断、仓位计算和决策理由。

## 推荐架构

新增独立目录 `audit-system/`，与 `ccxt-mcp/` 分离。它不提供交易执行工具，只负责本地审计记录、查询和展示。

核心组件：

1. `audit-core`：提供事件 schema、脱敏、稳定 JSON 序列化、SHA-256 payload hash、事件 hash chain、SQLite/JSONL/blob 双写存储。
2. `audit-cli`：提供本地命令，用于未来 V2 轮次把每个阶段事件写入审计库。CLI 只接受 JSON stdin，不读取行情、不执行交易。
3. `audit-server`：提供只读 HTTP API，并允许写入人工复盘备注。服务默认监听本机地址。
4. `audit-ui`：单独前端页面，展示轮次列表、链路时间线、候选对比、MCP payload、payload diff、symbol 历史决策和复盘备注。

## 数据保存

默认路径：

- SQLite：`state/audit/trading-audit.sqlite`
- JSONL：`state/audit/events/YYYY-MM-DD.jsonl`
- 原始 payload blob：`state/audit/blobs/<sha256>.json.gz`

SQLite 用于快速查询，JSONL 用于追加式归档，blob 保存脱敏后的原始 payload。每个事件都包含 `payload_hash`、`event_hash` 和 `previous_hash`，形成单轮内可校验链路。

## 事件模型

每条事件至少包含：

- `event_id`
- `cycle_id`
- `sequence`
- `timestamp`
- `type`
- `phase`
- `summary`
- `severity`
- `symbol`
- `parent_event_id`
- `tags`
- `payload_hash`
- `payload_ref`
- `previous_hash`
- `event_hash`

统一兼容模板：

- `phase` 是稳定生命周期，用于前端分组和复盘：`cycle`、`strategy`、`preflight`、`data`、`market`、`analysis`、`decision`、`intent`、`cta`、`risk`、`action`、`execution`、`verification`、`summary`、`review`。
- `type` 是策略自定义事件名，可以是下面的内置事件，也可以是未来策略自己的事件名。未来 V3 策略变化时，只要仍映射到这些 phase，就不需要改审计系统。

首批内置事件类型：

- `cycle.started`
- `mcp.call`
- `market.snapshot`
- `candidate.ranked`
- `candidate.filtered`
- `cta.decided`
- `risk.sized`
- `execution.planned`
- `order.submitted`
- `order.dry_run`
- `post.verify`
- `summary.finalized`
- `review.note`

## 脱敏规则

写入前必须递归脱敏以下字段：`apiKey`、`secret`、`password`、`token`、`authorization`、`cookie`、`proxyUrl`、`signature`、`listenKey`、`address`。脱敏后仍保留字段存在性，例如 `"[REDACTED]"`。交易价格、仓位、余额、订单 ID 和 symbol 保留，因为复盘需要。

## 前端视图

第一阶段必须实现：

- 轮次列表：按时间、状态、是否执行、symbol 搜索。
- 单轮时间线：按 sequence 展示事件链路。
- 事件详情：展示 summary、metadata、payload hash、raw payload。
- 候选表：展示每个候选的 CTA、风险收益、仓位和跳过原因。
- 执行与复核：展示订单响应、保护单、动作后 positions/orders/protection 状态。

第二阶段必须同时实现：

- payload diff：比较同一轮两个事件 payload。
- symbol 历史决策：按 symbol 聚合跨轮 CTA、仓位和执行结果。
- 复盘报告：按 cycle 生成结构化回顾视图。
- 人工备注：允许保存复盘备注，不允许触发交易行为。
- 链路校验：显示每轮 hash chain 是否连续。

## 安全边界

前端和 API 不包含任何下单、撤单、改仓、转账或提现功能。审计系统不 import `ccxt`，不读取交易所，不调用 MCP。它只读写本地审计文件。未来 V2 实盘轮次如果使用它，只能通过 audit CLI 写入本地事件。

## 与 V2 运行规程的集成

更新 `.cursor/skills/trading-v2` 文档：每轮启动时生成 `cycle_id`，每个阶段写审计事件，最终总结必须包含 `cycle_id`、审计库路径和 hash chain 状态。如果审计写入失败，仍然可以继续风控决策，但最终总结必须报告审计缺口。

## 验收标准

1. 能通过 CLI 写入一轮完整示例事件。
2. SQLite、JSONL 和 blob 文件都被写入。
3. API 能查询 cycles、events、payload、symbol history、review report 和 hash verification。
4. 前端能展示轮次列表、时间线、事件详情、候选表、payload diff、symbol history、复盘备注。
5. 测试覆盖脱敏、哈希链、双写存储、API 查询和示例数据生成。
6. 构建后本地服务可启动，并在浏览器访问前端。
