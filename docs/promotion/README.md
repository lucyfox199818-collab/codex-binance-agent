# Codex Binance Agent 中文推广包

本目录用于统一项目在中文开发者和加密技术社区的公开介绍。发布时优先链接：

- 仓库：https://github.com/lucyfox199818-collab/codex-binance-agent
- 中文主页：https://raw.githack.com/lucyfox199818-collab/codex-binance-agent/main/docs/site/index.html
- 演示：https://github.com/lucyfox199818-collab/codex-binance-agent/blob/main/demo/codex-binance-agent-demo.mp4
- 分享封面：[SVG](assets/social-preview.svg) · [PNG](assets/social-preview.png)
- 实战教程：[5 分钟无 Key 验证 MCP 与公开行情](../guides/5-minute-public-dry-run-zh.md)
- GitHub Release：https://github.com/lucyfox199818-collab/codex-binance-agent/releases/tag/v0.1.0
- MCP Registry：https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.lucyfox199818-collab%2Fccxt-mcp
- 公开镜像：`ghcr.io/lucyfox199818-collab/ccxt-mcp:0.1.0`
- 中文试用反馈：https://github.com/lucyfox199818-collab/codex-binance-agent/issues/1

## 一句话介绍

把 Codex CLI、CCXT MCP、三套本地交易 skills 和可验证审计系统组合起来，
构建一个默认 dry-run、决策过程可追踪的 Binance USDT-M 交易实验项目。

## 核心卖点

1. 不是只有提示词：包含 101 个显式 CCXT MCP tools，以及通用 `ccxt_call`。
2. 默认安全：真实交易默认关闭，同时启用 dry-run。
3. 策略可复现：V1 单轮扫描、V2 连续决策、V3 自由裁量均有本地 skill 约束。
4. 全链路审计：决策、风险、执行、复核写入 SQLite、JSONL 和 hash chain。
5. 本地优先：密钥和审计数据保留在本机，审计界面不提供交易操作。
6. 中文文档：安装、MCP 配置、策略调用、风控和常见问题均有中文说明。
7. 正式分发：已发布公开 GHCR 镜像，并进入官方 MCP Registry。

## 适用人群

- 想研究 Codex CLI 与 MCP 工具调用的开发者。
- 想搭建 AI 交易实验、但重视 dry-run、风险门禁和审计的人。
- 想参考 TypeScript MCP server、CCXT 封装或本地审计系统实现的人。

## 统一风险声明

本项目是开源工程与交易自动化实验，不构成投资建议，不承诺收益。合约和杠杆交易
可能快速损失本金。真实交易默认关闭，请先使用公共行情、dry-run 或测试环境验证，
并使用独立、低权限、禁用提现和配置 IP 白名单的 API key。

## 推荐发布顺序

| 优先级 | 渠道 | 内容 | 主要目标 |
| --- | --- | --- | --- |
| P0 | GitHub README | 项目主页与演示 | 收藏、Issue、贡献者 |
| P0 | Linux.do 等允许辅助写作的社区 | 技术项目首发帖 | 真实技术反馈 |
| P0 | V2EX | 作者亲自重写的项目经历 | 真实技术反馈 |
| P0 | 微信群 / Telegram | 短消息加演示 | 首批试用者 |
| P1 | 掘金 / 知乎 | 架构长文 | 搜索曝光 |
| P1 | B 站 | 演示视频与简介 | 直观展示 |
| P2 | 开源中国 / CSDN | 改写后的教程 | 长尾搜索 |

不要在同一天向所有社区投递完全相同的文本。先阅读每个社区的最新规则，在技术社区
收集安装问题，修正文档后再发布长文。任何反馈都应落到 Issue 或 README 改进中。

V2EX 官方规则明确禁止发送 AI 生成内容。本目录文案不得直接或稍作改写后发布到
V2EX；必须由项目作者基于自己的开发过程和真实体验重新写作。节点说明可参考：

- https://www.v2ex.com/about
- https://www.v2ex.com/help/node

## 可直接发布的素材

- [社区首发帖](community-launch.md)：允许辅助写作的中文技术社区。
- [长文提纲](long-form-article.md)：掘金、知乎、CSDN、开源中国。
- [短消息与视频简介](short-posts.md)：微信群、Telegram、朋友圈、B 站。
- [发布检查表](release-checklist.md)：发布前检查、评论回复和效果记录。
- [GitHub 仓库元数据](github-metadata.md)：About、topics、Social preview 和首个 Release。
- [中文试用反馈 Issue 正文](community-feedback-issue.md)：安装、MCP、dry-run 与审计反馈。

## 推荐标签

`Codex CLI` `MCP` `CCXT` `Binance` `TypeScript` `AI Agent`
`量化交易` `交易审计` `开源项目` `dry-run`
