# 短消息与视频简介

## 微信群 / Telegram

开源了一个 Codex CLI + MCP + CCXT 的 Binance 交易实验项目：

https://github.com/lucyfox199818-collab/codex-binance-agent

包含 101 个显式 CCXT MCP 工具、V1/V2/V3 三套本地交易 skills，以及带 SQLite、
JSONL 和 hash chain 的全链路审计。默认关闭真实交易并启用 dry-run，没有 API key
也能先读取公共行情。想找人一起测试安装、风控边界和审计设计。

说明：这是工程实验，不构成投资建议，合约交易可能损失本金。

## 朋友圈

最近把一个 Codex 交易 Agent 实验开源了：Codex CLI 通过 MCP 使用 CCXT，
支持行情、账户、订单、保护单和本地审计。重点做了默认 dry-run、风险门禁和执行后
复核，不是收益承诺。欢迎做 MCP、Agent 或量化工程的朋友试用和提 Issue。

项目：https://github.com/lucyfox199818-collab/codex-binance-agent

## B 站标题

用 Codex CLI + MCP 搭一个可审计的 Binance 交易 Agent｜默认 Dry-run

## B 站简介

演示 Codex CLI 如何通过 CCXT MCP 读取市场与账户状态，按照项目本地 V1/V2/V3
skills 完成分析、风险检查、dry-run 和交易审计。

项目开源地址：
https://github.com/lucyfox199818-collab/codex-binance-agent

主要组件：

- 101 个显式 CCXT MCP tools
- Binance USDT-M 行情、账户、订单与保护单
- 三套项目本地交易流程
- SQLite + JSONL + hash chain 审计
- 本地只读复盘界面

本视频和项目不构成投资建议，不承诺收益。真实交易默认关闭；合约与杠杆交易可能
快速损失本金，请先使用 dry-run 或测试环境。

推荐标签：Codex、MCP、AI Agent、CCXT、量化交易、开源项目、TypeScript

## 140 字短帖

开源：Codex Binance Agent。用 Codex CLI + MCP + CCXT 组织行情读取、账户检查、
交易工具与执行后复核，附 V1/V2/V3 本地 skills 和 hash chain 审计。默认禁用真实
交易、启用 dry-run。项目与演示：
https://github.com/lucyfox199818-collab/codex-binance-agent
