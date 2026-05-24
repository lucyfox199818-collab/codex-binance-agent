# Trading Audit System

本系统为交易轮次提供本地审计、全链路溯源和前端复盘展示。它不包含任何交易执行能力，不 import `ccxt`，不调用交易所，也不调用 MCP；它只写入和读取本地审计数据。

## 功能

- SQLite + JSONL + gzipped payload blob 双写/归档。
- 每条事件包含 payload hash、previous hash 和 event hash，支持单轮 hash chain 校验。
- CLI 可从 JSON stdin 写入事件，方便未来策略轮次逐阶段落盘。
- API 可查询 cycles、events、payload、payload diff、symbol 历史决策、复盘报告和 hash 校验。
- 前端展示轮次列表、时间线、事件详情、筛选路径、组合决策、执行/复核、payload diff、symbol history 和复盘备注。

## 统一兼容模板

审计系统不绑定具体策略。所有策略版本都写入同一个事件 envelope：

```json
{
  "cycleId": "cycle-...",
  "phase": "analysis",
  "type": "any.strategy.event.name",
  "summary": "human readable summary",
  "symbol": "BTC/USDT:USDT",
  "payload": {}
}
```

`phase` 是稳定生命周期，用于前端分组；`type` 是策略自定义事件名，可以随 V3 策略变化而变化。只要新策略仍映射到下面这些生命周期阶段，就不需要改审计系统：

| phase | 用途 |
| --- | --- |
| `cycle` | 轮次开始、结束、运行状态。 |
| `strategy` | 使用的策略文件、版本、授权范围。 |
| `preflight` / `data` / `market` | 账户、订单、保护单、行情、外部背景和 MCP 调用。 |
| `analysis` | AI 自由分析、观察对象、市场解释、等待理由。 |
| `decision` / `intent` / `trigger` | 是否交易、撤单、改单、减仓、平仓、反向或等待。 |
| `risk` | 仓位、杠杆、保证金、最大亏损、保护/退出方案。 |
| `action` / `execution` | 计划动作、dry-run、真实提交、撤改和平仓动作。 |
| `verification` | 动作后账户、持仓、未成交委托和保护状态复核。 |
| `summary` | 最终总结和下一轮关注点。 |
| `review` | 人工复盘备注。 |

不同策略可以写入自己的细节事件，例如筛选、分析、组合意图、执行动作或未来模型变更。它们都通过统一 `phase` 展示和复盘。

## 数据路径

默认从 `audit-system/` 运行时写入：

```text
../state/audit/trading-audit.sqlite
../state/audit/events/YYYY-MM-DD.jsonl
../state/audit/blobs/<sha256>.json.gz
```

可用 `AUDIT_DATA_DIR` 覆盖。

## 安装和验证

```bash
cd audit-system
npm install
npm test
npm run typecheck
npm run build
```

## 生成示例数据

```bash
cd audit-system
AUDIT_DATA_DIR=../state/audit npm run sample
AUDIT_DATA_DIR=../state/audit npm run sample:v3
```

## 启动前端

```bash
cd audit-system
npm run build
AUDIT_DATA_DIR=../state/audit AUDIT_PORT=4177 npm start
```

浏览器打开：

```text
http://127.0.0.1:4177
```

## CLI

追加事件：

```bash
cat event.json | AUDIT_DATA_DIR=../state/audit npm run audit -- append
```

校验链路：

```bash
AUDIT_DATA_DIR=../state/audit npm run audit -- verify <cycle_id>
```

列出轮次：

```bash
AUDIT_DATA_DIR=../state/audit npm run audit -- cycles
```

## API

- `GET /api/cycles`
- `GET /api/cycles/:cycleId`
- `GET /api/cycles/:cycleId/events`
- `GET /api/cycles/:cycleId/report`
- `GET /api/cycles/:cycleId/verify`
- `GET /api/events/:eventId/payload`
- `GET /api/symbols/:symbol/decisions`
- `GET /api/diff?left=<eventId>&right=<eventId>`
- `POST /api/cycles/:cycleId/notes`

## 安全边界

前端和 API 不提供下单、撤单、改单、改杠杆、转账或提现按钮。复盘备注是唯一写接口，只写本地 SQLite/JSONL/blob 审计数据，不触达交易所。
