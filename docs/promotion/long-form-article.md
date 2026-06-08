# 掘金 / 知乎长文素材

## 标题

从提示词到可审计执行：用 Codex CLI、MCP 和 CCXT 搭建交易 Agent

## 摘要

本文介绍一个开源的 Binance USDT-M 交易实验项目。重点不是预测收益，而是如何把
Agent 的市场读取、账户状态、风险门禁、工具执行和事后复核组织成一条默认 dry-run、
可追踪、可验证的工程链路。

## 文章结构

### 1. 为什么“一段交易提示词”不够

- 模型不知道账户真实状态。
- 工具调用成功不等于交易所最终状态正确。
- 决策、下单和保护单之间可能出现部分失败。
- 没有持久审计就无法解释一次交易为什么发生。

### 2. 项目架构

```text
Codex CLI
  ├─ project-local trading skills (V1 / V2 / V3)
  ├─ ccxt-mcp (market / account / orders / derivatives)
  └─ trading-intel MCP (audit analytics / public context)
         |
         └─ local audit system (SQLite / JSONL / blobs / hash chain)
```

说明 Codex 负责当前会话内决策，MCP 只提供有边界的工具，审计系统不具备交易能力。

### 3. MCP 工具层如何设计

- 使用 CCXT unified API，同时保留 `ccxt_call` 扩展入口。
- 区分公共行情、账户读取、交易动作和账户变更。
- 用环境变量形成双开关：`enableTrading` 与 `dryRun`。
- 对 Binance USDT-M 的保护单、hedge mode 和条件单做专门处理。

### 4. 三种策略不是三个提示词

- V1：单轮全市场扫描，适合明确边界的一次性运行。
- V2：当前 Codex 会话中的连续循环，包含 cooldown 和执行质量控制。
- V3：允许外部研究和脚本辅助，但最终动作仍需走已验证工具。

强调策略阈值在 `V*.txt`，执行纪律在项目本地 `SKILL.md`。

### 5. 为什么要做全链路审计

- 生命周期 phase：preflight、market、analysis、decision、risk、execution、verification。
- SQLite 用于查询，JSONL 用于归档，压缩 blob 保存大 payload。
- event hash 与 previous hash 用于校验单轮事件链。
- 只读工作台用于复盘，不把交易操作混进审计界面。

### 6. 最小体验流程

```bash
git clone https://github.com/lucyfox199818-collab/codex-binance-agent.git
cd codex-binance-agent/ccxt-mcp
npm ci && npm run build
cd ../audit-system
npm ci && npm run build
```

随后按 README 注册两个 MCP，并保持：

```dotenv
CCXT_ENABLE_TRADING=false
CCXT_DRY_RUN=true
```

### 7. 仍然存在的风险

- 模型判断可能错误，策略可能亏损。
- API、网络、交易所状态和订单语义可能变化。
- dry-run 不能完整模拟滑点、流动性和部分成交。
- 开启真实交易前必须独立验证权限、仓位模式、保护单和执行后状态。

### 8. 开源协作方向

- 更多交易所和市场类型的兼容测试。
- 更细的权限分层和工具 allowlist。
- 审计报告导出与策略版本对比。
- testnet 端到端测试。

项目地址：
https://github.com/lucyfox199818-collab/codex-binance-agent

风险声明：本文介绍的是工程实验，不构成投资建议，不承诺收益。合约和杠杆交易可能
快速损失本金，请优先使用 dry-run 或测试环境。
