# Codex Binance Agent

这是一个让 Codex CLI 通过 MCP 读取加密货币市场、管理 Binance USDT-M
永续合约，并在本地记录完整交易审计的项目。

[GitHub 仓库](https://github.com/lucyfox199818-collab/codex-binance-agent)
· [演示视频](demo/codex-binance-agent-demo.mp4)
· [中文社区推广素材](docs/promotion/README.md)
· [版本记录](CHANGELOG.md)

**30 秒了解项目：** Codex 负责当前会话内的研究和交易决策，`ccxt-mcp`
提供行情、账户与交易工具，项目本地 skills 约束 V1/V2/V3 流程，
`audit-system` 记录每轮决策、风控、执行和复核。真实交易默认关闭，首次体验无需
API key 即可读取公共行情并运行 dry-run。

项目包含：

- `ccxt-mcp/`：基于 CCXT 的 MCP stdio 服务，提供行情、账户、订单和交易工具。
- `audit-system/`：本地审计记录、复盘界面，以及只读的 `trading-intel` MCP。
- `V1.txt`、`V2.txt`、`V3.txt`：三套交易策略和风险边界。
- `.cursor/skills/trading-v*/`：Codex 执行对应策略时必须遵循的项目本地 skills。

> 风险提示：本项目可以提交真实合约订单。默认配置关闭真实交易并启用
> dry-run。请先在 dry-run 或 Binance 测试环境中验证。任何策略、模型或示例都不保证盈利，
> 杠杆交易可能导致本金快速损失。

## 环境要求

- Linux、macOS 或 WSL2。
- Node.js `>= 22.13.0` 和 npm。
- Codex CLI。
- 可选：Binance API key、网络代理、Docker。

检查版本：

```bash
node --version
npm --version
codex --version
```

安装 Codex CLI（macOS/Linux）：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex
```

第一次运行 `codex` 时，按提示使用 ChatGPT 账号或 API key 登录。Codex CLI
安装和认证方式以 [OpenAI Codex CLI 文档](https://developers.openai.com/codex/cli)
为准。

## 安装项目

```bash
git clone https://github.com/lucyfox199818-collab/codex-binance-agent.git
cd codex-binance-agent

cd ccxt-mcp
npm ci
npm run build

cd ../audit-system
npm ci
npm run build

cd ..
```

项目根目录没有统一的 npm workspace，因此两个子项目需要分别安装和构建。

## 配置交易所

创建本地环境文件：

```bash
cp ccxt-mcp/.env.example ccxt-mcp/.env
```

编辑 `ccxt-mcp/.env`：

```dotenv
# 可选。无代理时删除这一行或留空。
TRADINGAGENTS_PROXY_URL=http://127.0.0.1:7890

# 只读取公共行情时可以留空；读取账户或交易时必须填写。
BINANCE_API_KEY=
BINANCE_API_SECRET=

CCXT_EXCHANGE_ID=binance
CCXT_DEFAULT_TYPE=future
CCXT_SANDBOX=false
CCXT_TIMEOUT_MS=30000

# 初次使用必须保持以下默认值。
CCXT_ENABLE_TRADING=false
CCXT_DRY_RUN=true
```

`.env` 已被 `.gitignore` 忽略。不要把 API key、secret 或完整 `.env` 提交到 Git、
粘贴到提示词、日志或网页服务。

建议为该项目创建独立且低权限的 Binance API key：

- 只启用需要的读取和合约交易权限。
- 禁用提现权限。
- 配置 IP 白名单，并先用 `ccxt_proxy_ip` 核对出口 IP。
- 不要复用持有大量资产的主账户密钥。

## 配置 MCP

`ccxt-mcp` 和 `trading-intel` 都是 stdio 服务。通常不需要提前常驻启动，
Codex 会按 MCP 配置自动启动它们。

先取得项目绝对路径：

```bash
cd /path/to/codex-binance-agent
pwd
```

将下面的 `/ABS/PATH/codex-binance-agent` 替换为 `pwd` 输出，然后注册 MCP：

```bash
codex mcp add ccxt -- \
  bash -lc 'cd /ABS/PATH/codex-binance-agent/ccxt-mcp && exec node dist/index.js'

codex mcp add trading-intel \
  --env AUDIT_DATA_DIR=/ABS/PATH/codex-binance-agent/state/audit -- \
  bash -lc 'cd /ABS/PATH/codex-binance-agent/audit-system && exec node dist/mcp/index.js'
```

检查配置：

```bash
codex mcp list
codex mcp get ccxt
codex mcp get trading-intel
```

注册后重新启动 Codex 会话。在 Codex TUI 中输入 `/mcp`，应能看到：

- `ccxt`：市场、账户和交易工具。
- `trading-intel`：本地审计分析、CoinGecko 和 DefiLlama 只读工具。

Codex 也支持在 `~/.codex/config.toml` 或项目的 `.codex/config.toml` 中直接配置
MCP；详见 [Codex MCP 文档](https://developers.openai.com/codex/mcp)。

### 手工测试 MCP

下面的服务使用 stdio，启动后没有普通终端输出并持续等待输入是正常现象；
按 `Ctrl+C` 退出：

```bash
cd ccxt-mcp
npm start
```

开发模式：

```bash
cd ccxt-mcp
npm run dev
```

## 使用 Codex CLI 炒币

必须从项目目录启动 Codex，使其读取根目录的 `AGENTS.md`、策略文件和项目本地
skills：

```bash
cd /path/to/codex-binance-agent
codex
```

推荐先执行只读检查：

```text
使用 ccxt MCP 调用 ccxt_get_config，确认 exchange、defaultType、
凭据状态、代理状态、CCXT_ENABLE_TRADING 和 CCXT_DRY_RUN。不要下单。
```

确认结果中 `enableTrading=false`、`dryRun=true` 后，再运行策略。

### V1：单轮超级短线扫描

在 Codex 中输入：

```text
$trading-v1 按 V1 运行一轮完整交易流程。当前只允许 dry-run，
读取账户、持仓、普通订单、保护单和全市场行情，完成审计和最终总结，不要真实下单。
```

也可以直接从 shell 发起：

```bash
codex -C /path/to/codex-binance-agent \
  '$trading-v1 按 V1 运行一轮完整 dry-run，禁止真实下单。'
```

### V2：连续决策循环

```text
$trading-v2 按 V2 启动连续交易流程，每 60 秒一轮。保持 dry-run，
每轮完成账户对账、市场扫描、cooldown 检查、审计和总结，直到我要求停止。
```

V2 是当前 Codex 会话内的连续流程。不要用无人值守脚本、cron 或后台 runner
代替 Codex 做交易决策。

### V3：自由裁量交易

```text
$trading-v3 按 V3 运行一轮自由裁量交易流程。保持 dry-run，
先完成账户级组合判断和必要研究，再决定是否交易，并写入完整审计。
```

V3 允许 Codex 使用脚本、公开网页和外部数据辅助研究，但最终账户动作必须由当前
Codex 会话判断，并通过已验证的交易工具执行和复核。

### 三种策略的区别

| 策略 | 适用方式 | 核心特点 |
| --- | --- | --- |
| V1 | 单轮调用 | 全市场超级短线扫描，多候选和受保护执行。 |
| V2 | 当前会话连续运行 | 默认每 60 秒一轮，包含 cooldown 和更严格的执行质量控制。 |
| V3 | 单轮自由裁量 | 允许自由研究和脚本辅助，先做账户级组合判断。 |

每次策略运行都必须重新读取对应的 `V*.txt`。策略阈值、风险和交易授权以该文件为准，
执行顺序和审计纪律以对应 `.cursor/skills/trading-v*/SKILL.md` 为准。

## 启用真实交易

只有完成 dry-run、测试环境验证、API 权限检查和出口 IP 检查后，才考虑修改：

```dotenv
CCXT_ENABLE_TRADING=true
CCXT_DRY_RUN=false
```

重新启动 Codex，然后先要求它调用 `ccxt_get_config`。只有返回结果明确显示
`enableTrading=true` 且 `dryRun=false`，执行工具才会发送真实交易请求。

真实交易提示词应明确策略版本和范围，例如：

```text
$trading-v1 按 V1 运行一轮。先确认交易开关、账户、持仓、普通订单和保护单；
严格按 V1.txt 风控自主判断。只有所有门禁通过时才允许真实执行，
执行后立即复核持仓、成交和止盈止损，并完成审计总结。
```

不要仅凭“已调用下单工具”判断交易成功。必须在动作后重新读取：

- 账户余额和保证金。
- 实际 positions。
- 普通未成交订单。
- 条件单和止盈止损保护单。
- 最近成交、订单 ID、成交数量和均价。

## 审计和复盘界面

交易 skill 会把审计数据写入 `state/audit/`。启动本地复盘界面：

```bash
cd audit-system
npm run build
AUDIT_DATA_DIR=../state/audit AUDIT_PORT=4177 npm start
```

浏览器打开：

```text
http://127.0.0.1:4177
```

常用审计命令：

```bash
cd audit-system

# 列出交易轮次
AUDIT_DATA_DIR=../state/audit npm run audit -- cycles

# 校验指定轮次的 hash chain
AUDIT_DATA_DIR=../state/audit npm run audit -- verify <cycle_id>

# 列出当前 cooldown
AUDIT_DATA_DIR=../state/audit npm run audit -- cooldowns list
```

审计系统本身不会下单、撤单、改仓、转账或提现。

## Docker 运行 ccxt-mcp

```bash
cd ccxt-mcp
docker build -t ccxt-mcp:local .
docker run --rm -i --env-file .env ccxt-mcp:local
```

使用 Docker 注册 MCP：

```bash
codex mcp add ccxt-docker -- \
  docker run --rm -i \
  --env-file /ABS/PATH/codex-binance-agent/ccxt-mcp/.env \
  ccxt-mcp:local
```

## 开发和验证

```bash
cd ccxt-mcp
npm test
npm run typecheck
npm run build

cd ../audit-system
npm test
npm run typecheck
npm run build
```

更详细的组件文档：

- [`ccxt-mcp/README.md`](ccxt-mcp/README.md)
- [`audit-system/README.md`](audit-system/README.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)

## 常见问题

### Codex 看不到 MCP

```bash
codex mcp list
codex mcp get ccxt
```

确认两个子项目都已构建且 `dist/` 存在，然后重启 Codex。在 TUI 中使用 `/mcp`
检查初始化错误。

### MCP 启动后一直没有输出

这是 stdio MCP 的正常行为。它正在等待客户端协议消息，不是 HTTP 服务。

### 能读取行情但不能读取余额

公共行情不需要 API key；余额、持仓、订单和成交历史需要正确的 API 凭据和权限。

### 下单工具返回 dry-run

这是默认安全行为。检查 `ccxt_get_config` 的 `enableTrading` 和 `dryRun`，不要在未完成
测试和风险检查时关闭 dry-run。

### 修改 `.env` 后没有生效

MCP 进程启动时读取环境变量。退出并重新启动 Codex 会话，让 Codex 重启 MCP 服务。

## 联系方式

- 微信：`mypcwza`
- Telegram：`mypcwza`
