# Trading Audit System

本系统为交易轮次提供本地审计、全链路溯源和前端复盘展示。它不包含任何交易执行能力，不 import `ccxt`，不调用交易所，也不调用 MCP；它只写入和读取本地审计数据。

## 功能

- SQLite + JSONL + gzipped payload blob 双写/归档。
- 每条事件包含 payload hash、previous hash 和 event hash，支持单轮 hash chain 校验。
- 持久 cooldown 注册表：保存 symbol/side 级别的入场冷却（止损、abort、主动平仓、外部停止），供策略侧在新入场前查询和写入。
- CLI 可从 JSON stdin 写入事件，方便未来策略轮次逐阶段落盘。
- 只读 `trading-intel-mcp`：把本地审计数据聚合为 cycle/decision/risk/execution 统计，并提供 CoinGecko 与 DefiLlama 公共免费市场背景工具。
- API 可查询 cycles、events、payload、payload diff、symbol 历史决策、复盘报告和 hash 校验；cycles/events 支持分页和过滤。
- 前端是审计工作台：左侧分页轮次导航，中间按标签页查看概览/时间线/策略数据/分析决策/风险执行/diff/备注/完整报告，右侧按需查看事件详情。

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
AUDIT_DATA_DIR=../state/audit AUDIT_LARGE_CYCLES=120 AUDIT_LARGE_EVENTS=80 npm run sample:large
```

`sample:large` 只写本地审计数据，不调用交易所、不调用 MCP。可用 `AUDIT_LARGE_CYCLES` 和 `AUDIT_LARGE_EVENTS` 调整压测规模。

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

管理冷却窗口（cooldown registry）：

```bash
# 写入冷却（默认时长按 reason 取：stop=30m / abort=15m / manual_close=15m / external=30m / tp_close=0）
echo '{"symbol":"HYPE/USDT:USDT","side":"long","reason":"stop","cycleId":"v2-...","notes":"stopped at 58.56"}' \
  | AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns set

# 查询是否仍被阻止
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns check HYPE/USDT:USDT long
# blocked=true 时返回 exit code 2 和 {blocked,remainingSeconds,entry}

# 列出当前活跃冷却（或只看一个 symbol）
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns list
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns list HYPE/USDT:USDT

# 列出全部历史（含 cleared / 过期）
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns all

# 手工清除（可选 side 限制；默认清掉同 symbol 下全部活跃记录）
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns clear HYPE/USDT:USDT long
```

`cooldowns set` 写入会自动把同 symbol/side 上还在生效的旧记录 supersede 掉；`cooldowns check` 只把未过期且未 cleared 的记录视为阻塞。

## 只读 MCP

构建后启动本地智能数据 MCP：

```bash
cd audit-system
npm run build:server
AUDIT_DATA_DIR=../state/audit npm run mcp
```

Codex MCP stdio 配置示例：

```json
{
  "mcpServers": {
    "trading-intel": {
      "command": "node",
      "args": ["/home/codex-binance-agent/audit-system/dist/mcp/index.js"],
      "cwd": "/home/codex-binance-agent/audit-system",
      "env": {
        "AUDIT_DATA_DIR": "/home/codex-binance-agent/state/audit"
      }
    }
  }
}
```

工具：

- `audit_analyze_cycles`：只读聚合本地 cycle、event、phase、type、symbol 和执行率。
- `audit_analyze_trading_decisions`：只读聚合 CTA、risk gate、execution skip 和 execution event。
- `audit_get_cycle_digest`：只读返回单轮摘要和可选 final summary payload。
- `coingecko_search`：CoinGecko public search。
- `coingecko_trending`：CoinGecko public trending。
- `coingecko_markets`：CoinGecko public market-cap/category/sector context。
- `defillama_protocols`：DefiLlama public protocol TVL metadata。
- `defillama_protocol`：DefiLlama public protocol detail and historical TVL by slug。
- `defillama_stablecoins`：DefiLlama public stablecoin supply context。
- `defillama_yields_pools`：DefiLlama public yield pools，默认可用 `limit` 截断返回。
- `defillama_fees_overview`：DefiLlama public fees/revenue overview。
- `defillama_prices_current`：DefiLlama public current token prices，例如 `coingecko:ethereum`。

这些工具不下单、不撤单、不改仓、不读取或发送交易所密钥。CoinGecko 默认走免费 public endpoint；如设置 `COINGECKO_DEMO_API_KEY` 只用于官方 demo key 额度，不启用付费 Pro-only endpoint。DefiLlama 只接 public API base URLs，不接 Pro endpoint、不需要 API key。

## API

- `GET /api/cycles`
- `GET /api/cycles?limit=50&cursor=50&q=BTC&status=completed&symbol=BTC`
- `GET /api/cycles/:cycleId`
- `GET /api/cycles/:cycleId/events`
- `GET /api/cycles/:cycleId/events?limit=50&cursor=50&phase=analysis&q=BTC`
- `GET /api/cycles/:cycleId/overview`
- `GET /api/cycles/:cycleId/report`
- `GET /api/cycles/:cycleId/verify`
- `GET /api/events/:eventId/payload`
- `GET /api/symbols/:symbol/decisions`
- `GET /api/diff?left=<eventId>&right=<eventId>`
- `POST /api/cycles/:cycleId/notes`

## 安全边界

前端和 API 不提供下单、撤单、改单、改杠杆、转账或提现按钮。复盘备注是唯一写接口，只写本地 SQLite/JSONL/blob 审计数据，不触达交易所。

大数据优化不要求重启任何已运行服务。完成代码构建后，只有在你手动执行 `npm start` 或重启现有进程时，新前端才会被正在使用的服务加载。
