# 5 分钟体验 Codex + MCP 交易工具：无 API Key、禁止真实交易

本文提供一条可复现的最小路径，用公开 OCI 镜像验证：

1. MCP stdio 服务能够完成协议初始化。
2. 服务没有收到 API key 或 secret。
3. `CCXT_ENABLE_TRADING=false`。
4. `CCXT_DRY_RUN=true`。
5. 可以读取公开永续合约行情。

项目地址：
https://github.com/lucyfox199818-collab/codex-binance-agent

官方 MCP Registry 名称：
`io.github.lucyfox199818-collab/ccxt-mcp`

> 本项目是工程与交易自动化实验，不构成投资建议，不承诺收益。合约和杠杆交易可能
> 快速损失本金。本文全程不使用账户凭据，并禁止真实交易。

## 1. 准备 Docker

确认 Docker Engine 可以运行：

```bash
docker version
```

公开镜像为：

```text
ghcr.io/lucyfox199818-collab/ccxt-mcp:0.1.0
```

该镜像可以匿名拉取。它对应项目的 `v0.1.0` 版本，并已进入官方 MCP Registry。

## 2. 一条命令完成公开行情验证

克隆项目后运行仓库内的 smoke test：

```bash
git clone https://github.com/lucyfox199818-collab/codex-binance-agent.git
cd codex-binance-agent

./scripts/public-mcp-smoke.sh
```

脚本默认使用 OKX 的公开 swap 行情，因为不同地区对 Binance 公共 API 的可访问性并不
一致。它不会传入任何账户密钥，并强制设置：

```dotenv
CCXT_ENABLE_TRADING=false
CCXT_DRY_RUN=true
```

脚本向 MCP server 发送四条 JSON-RPC 消息：

- `initialize`
- `notifications/initialized`
- 调用 `ccxt_get_config`
- 调用 `ccxt_fetch_ticker`

最后它会解析响应并执行断言，而不是只检查进程退出码。成功摘要类似：

```json
{
  "ok": true,
  "server": {
    "name": "ccxt-mcp",
    "version": "0.1.0"
  },
  "safety": {
    "exchangeId": "okx",
    "hasApiKey": false,
    "enableTrading": false,
    "dryRun": true
  },
  "ticker": {
    "symbol": "BTC/USDT:USDT",
    "datetime": "2026-06-08T11:57:26.009Z",
    "last": 63393.4
  }
}
```

上面的价格只是 **2026 年 6 月 8 日** 一次实测的响应片段，不是当前报价，也不是交易
信号。你运行时应得到新的时间和价格。

## 3. 验证 Binance 公共行情

如果你的所在地和网络环境允许访问 Binance，可以覆盖默认交易所：

```bash
CCXT_EXCHANGE_ID=binance \
CCXT_DEFAULT_TYPE=future \
./scripts/public-mcp-smoke.sh
```

如果返回 HTTP `451`，并包含 restricted location 或 eligibility 信息，说明 Binance
根据当前出口位置拒绝提供服务。这不是 MCP 协议错误，也不应通过伪造所在地或违反
当地规则来绕过。

可采取的合规处理：

- 确认 Binance 是否在你的所在地提供相关服务。
- 检查是否误用了公司代理、云服务器出口或错误网络路径。
- 在符合当地规则的前提下，使用项目支持的其他 CCXT 交易所读取公开行情。
- 仅在你有权使用的环境中配置 `TRADINGAGENTS_PROXY_URL` 或 `CCXT_PROXY_URL`。

脚本默认使用 OKX 只是为了验证通用 CCXT MCP 链路；V1/V2/V3 中针对 Binance
USDT-M 的策略和保护单语义不能自动等同迁移到其他交易所。

## 4. 注册到 Codex CLI

先确认已经安装 Codex CLI：

```bash
codex --version
```

使用公开容器注册一个只读/dry-run MCP：

```bash
codex mcp add ccxt-public \
  --env CCXT_EXCHANGE_ID=okx \
  --env CCXT_DEFAULT_TYPE=swap \
  --env CCXT_ENABLE_TRADING=false \
  --env CCXT_DRY_RUN=true -- \
  docker run --rm -i \
  -e CCXT_EXCHANGE_ID \
  -e CCXT_DEFAULT_TYPE \
  -e CCXT_ENABLE_TRADING \
  -e CCXT_DRY_RUN \
  ghcr.io/lucyfox199818-collab/ccxt-mcp:0.1.0
```

检查注册结果：

```bash
codex mcp get ccxt-public
```

重新启动 Codex 会话后，先发送：

```text
使用 ccxt-public 调用 ccxt_get_config。只检查配置，不调用任何交易类工具。
确认 hasApiKey=false、enableTrading=false、dryRun=true。
```

再读取公开行情：

```text
使用 ccxt-public 调用 ccxt_fetch_ticker，读取 BTC/USDT:USDT。
只返回 symbol、datetime、bid、ask、last 和 percentage，不下单。
```

## 5. 本地生成审计示例

审计系统可以完全离线生成示例，不调用交易所：

```bash
cd audit-system
npm ci
npm run build
AUDIT_DATA_DIR=../state/audit npm run sample
AUDIT_DATA_DIR=../state/audit npm run sample:v3
```

启动只读复盘工作台：

```bash
AUDIT_DATA_DIR=../state/audit AUDIT_PORT=4177 npm start
```

浏览器打开：

```text
http://127.0.0.1:4177
```

可以查看轮次概览、时间线、策略数据、分析决策、风险执行、payload diff、备注和
hash chain 校验。审计页面没有下单、撤单、改单、转账或提现功能。

## 6. 接下来不要急着做什么

完成公开行情 smoke test 不代表真实交易已经安全。它没有验证：

- 账户权限、余额和仓位模式。
- Binance testnet 或真实账户连接。
- 实际滑点、部分成交和网络重试。
- 条件单、止损止盈和执行后复核。
- 策略盈利能力。

在没有完成独立账户、低权限 key、禁用提现、IP 白名单、testnet、保护单和小额验证
之前，不要修改：

```dotenv
CCXT_ENABLE_TRADING=false
CCXT_DRY_RUN=true
```

## 7. 反馈

中文安装与试用问题统一记录在：

https://github.com/lucyfox199818-collab/codex-binance-agent/issues/1

请附操作系统、Docker/Node.js/Codex 版本、运行命令和脱敏后的最小错误信息。不要上传
API key、secret、完整 `.env`、余额、持仓、订单 ID、地址或出口 IP。
