## 目的

这里集中收集中文用户对 Codex Binance Agent 的实际试用反馈，优先处理：

- Linux、macOS、WSL2 下的安装和构建问题。
- Codex CLI 注册、启动和调用 `ccxt-mcp` / `trading-intel` 的问题。
- 无 API key 的公共行情读取与默认 dry-run 体验。
- V1 / V2 / V3 项目本地 skill 的可理解性和执行边界。
- 审计工作台、报告、hash chain 与 cooldown 的使用问题。
- 中文文档中不清楚、过时或缺失的部分。

项目地址：
https://github.com/lucyfox199818-collab/codex-binance-agent

中文主页：
https://raw.githack.com/lucyfox199818-collab/codex-binance-agent/main/docs/site/index.html

## 反馈格式

请尽量包含：

```text
操作系统：
Node.js 版本：
Codex CLI 版本：
使用方式：源码 / GHCR 镜像
运行模式：公共行情 / dry-run / testnet
执行步骤：
实际结果：
预期结果：
脱敏后的最小错误信息：
```

## 安全要求

**不要上传或粘贴以下内容：**

- API key、secret、完整 `.env`。
- 账户余额、持仓、订单 ID、成交记录和充值/提现地址。
- 代理凭据、出口 IP、白名单和其他身份信息。

请优先使用公共行情和 dry-run 复现。安全漏洞或凭据暴露请使用
[GitHub Security Advisory](https://github.com/lucyfox199818-collab/codex-binance-agent/security/advisories/new)
私下报告。

本项目不构成投资建议，不承诺收益。这里不提供个性化买卖信号或代操服务。

## 当前最需要的反馈

1. 从零安装时，哪一步最容易失败？
2. 101 个 MCP 工具的命名和参数是否容易理解？
3. 执行后复核与审计报告还缺哪些关键信息？
4. 哪些交易动作应进一步收紧权限或增加二次确认？
5. 哪类中文教程或演示最有帮助？
