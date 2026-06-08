# GitHub 仓库元数据

这些设置需要仓库管理员在 GitHub 网页或 GitHub CLI 中完成，不能只通过 Git commit
修改。

## About 描述

推荐使用：

> Codex CLI + MCP + CCXT 的可审计 Binance 交易实验项目，默认 dry-run，包含
> V1/V2/V3 本地 skills、风险门禁和全链路复盘。

英文备选：

> Auditable Codex CLI trading agent with CCXT MCP tools, local V1/V2/V3 skills,
> dry-run defaults, risk gates, and end-to-end review.

## Website

在没有独立站点前，可填写 README 的固定链接：

https://github.com/lucyfox199818-collab/codex-binance-agent#readme

## Topics

GitHub topics 建议控制在 10 至 15 个：

```text
codex
codex-cli
mcp
mcp-server
ccxt
binance
ai-agent
ai-trading
algorithmic-trading
trading-bot
typescript
crypto
trading-audit
dry-run
```

## Social preview

推荐规格为 1280 x 640。封面应突出：

- `Codex Binance Agent`
- `MCP 交易工具 · 默认 Dry-run · 全链路审计`
- 终端、工具节点、风险盾牌和审计链路

避免收益率、上涨箭头、钞票、邀请码和官方 Binance/OpenAI logo，防止形成收益承诺或
品牌混淆。

## 首个 Release

建议在安装流程经过一次干净环境验证后创建 `v0.1.0`：

```text
Title: v0.1.0 - Dry-run-first Codex + CCXT MCP trading workflow

- CCXT MCP market, account, order, derivatives, and protection tools
- Project-local V1/V2/V3 trading skills
- Dry-run defaults and explicit live-trading gates
- Local SQLite/JSONL/hash-chain audit system
- Read-only trading-intel MCP and review workbench
```

发布说明必须保留“实验项目、非投资建议、不承诺收益、杠杆可能损失本金”的声明。

## 待所有者决定

- 选择并添加明确的开源 License。没有 License 时，外部开发者默认没有复制、修改和
  分发代码的许可，会阻碍采用和贡献。
- 在仓库 Settings → Pages 中将 Source 设为 GitHub Actions，然后手动运行
  `Deploy Chinese landing page` 工作流，即可把临时 RawGitHack 主页切换到
  `https://lucyfox199818-collab.github.io/codex-binance-agent/`。
- 是否启用 GitHub Discussions 作为中文问答区。
- 是否公开路线图和 good first issue 标签。
