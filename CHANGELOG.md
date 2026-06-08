# Changelog

本项目的版本记录从 `v0.1.0` 开始。版本号用于标记可复现的代码、文档和默认安全
边界，不代表策略收益或真实交易适用性。

## v0.1.0 - 2026-06-08

首个公开基线版本：

- 提供 101 个显式注册的 CCXT MCP 工具，以及通用 `ccxt_call`。
- 支持市场数据、账户状态、普通订单、条件单、保护单和 Binance USDT-M 衍生品数据。
- 提供 V1 单轮扫描、V2 连续决策和 V3 自由裁量三套项目本地交易 skills。
- 默认 `CCXT_ENABLE_TRADING=false`、`CCXT_DRY_RUN=true`。
- 提供 SQLite、JSONL、压缩 payload blob 和单轮 hash chain 审计。
- 提供只读 `trading-intel` MCP 与本地复盘工作台。
- 提供中文安装文档、演示视频、社区推广素材、Issue 模板和贡献指南。
- 升级 Vitest 至 `4.1.8`，两个子项目的依赖审计均为 0 漏洞。

验证结果：

- `ccxt-mcp`：30 项测试通过。
- `audit-system`：33 项测试通过。
- 两个子项目的 typecheck 和 production build 通过。

风险提示：本项目是工程与交易自动化实验，不构成投资建议，不承诺收益。合约和杠杆
交易可能快速损失本金，请先使用公共行情、dry-run 或测试环境。
