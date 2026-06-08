# 中文技术社区首发帖

## 标题候选

1. 开源了一个 Codex + MCP 的 Binance 交易实验项目，默认 dry-run，带完整审计
2. 我把 CCXT 的行情和交易能力接入 Codex CLI，并给每轮决策加了 hash chain 审计
3. Codex 能不能安全地调用交易工具？这是我的开源实现和风险边界

## 正文

最近在做一个开源实验：让 Codex CLI 通过 MCP 使用 CCXT 读取市场、账户和订单数据，
再按照项目内的交易 skill 完成分析、风控、dry-run 和复盘。

仓库：
https://github.com/lucyfox199818-collab/codex-binance-agent

演示：
https://github.com/lucyfox199818-collab/codex-binance-agent/blob/main/demo/codex-binance-agent-demo.mp4

官方 MCP Registry：
https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.lucyfox199818-collab%2Fccxt-mcp

中文试用反馈：
https://github.com/lucyfox199818-collab/codex-binance-agent/issues/1

它不是一段“帮我炒币”的提示词，主要由四部分组成：

- `ccxt-mcp`：TypeScript MCP stdio 服务，显式注册 101 个行情、账户、订单和衍生品工具。
- V1/V2/V3：单轮扫描、连续决策和自由裁量三种流程，各自有本地 skill 和风险边界。
- `audit-system`：把每轮策略、数据、分析、决策、风控、执行和复核写入本地审计。
- `trading-intel`：只读 MCP，用于查询历史轮次并补充 CoinGecko、DefiLlama 公共数据。

`ccxt-mcp` 已发布为公开 OCI 镜像：
`ghcr.io/lucyfox199818-collab/ccxt-mcp:0.1.0`。

我最在意的是安全边界：

- 默认 `CCXT_ENABLE_TRADING=false`、`CCXT_DRY_RUN=true`。
- 真实交易必须同时显式打开两个开关。
- 保护单、执行后复核、cooldown 和账户级风险检查写进流程。
- 审计界面只读，不提供下单、撤单、转账或提现按钮。
- API key 建议独立、低权限、禁用提现并绑定 IP。

没有 API key 也可以从公共行情和 dry-run 开始。项目目前更适合研究 MCP 工具设计、
Agent 风控和交易审计，不是收益产品，也不构成投资建议。

希望得到几类反馈：

1. 安装或 MCP 配置中哪些步骤不够清楚？
2. 现有交易工具和审计字段还缺什么？
3. 怎样进一步降低误操作和真实交易风险？
4. 是否有人愿意一起补测试、文档或支持更多交易所？

如果你在做 Codex、MCP、CCXT 或 Agent 审计，欢迎在中文试用反馈 Issue 中留言。

## V2EX 特别限制

不要把本文件正文发布到 V2EX。V2EX 官方规则明确禁止发送 AI 生成内容，项目作者必须
根据自己的开发经历、实际取舍和真实测试结果从头撰写。完成后再根据内容选择
`分享创造`、`GitHub`、`OpenAI`、`区块链` 或其他最匹配的节点。

发布前查看最新规则：

- https://www.v2ex.com/about
- https://www.v2ex.com/help/node

作者自行撰写时仍应保持技术讨论导向，不使用收益截图、拉群返利、邀请码或“稳赚”
等表述。

## Linux.do 补充说明

可在正文后增加环境信息：Node.js `>=22.13.0`，支持 Linux、macOS 和 WSL2。
优先回答复现问题，并把共性问题同步回 README。
