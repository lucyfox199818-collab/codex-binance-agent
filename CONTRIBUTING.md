# Contributing

感谢你参与 Codex Binance Agent。优先欢迎可复现的 bug、文档改进、测试覆盖、交易安全
增强和审计能力改进。

## 提交 Issue

使用仓库 Issue 模板，并提供操作系统、Node.js 版本、Codex CLI 版本、复现步骤和最小
错误信息。

提交前必须删除：

- API key、secret 和完整 `.env`。
- 账户余额、持仓、订单 ID、成交记录和地址。
- 代理凭据、出口 IP 和其他身份信息。

安全漏洞或凭据暴露请使用 GitHub Security Advisory 私下报告，不要创建公开 Issue。

## 本地验证

```bash
cd ccxt-mcp
npm ci
npm test
npm run typecheck
npm run build

cd ../audit-system
npm ci
npm test
npm run typecheck
npm run build
```

涉及交易工具的改动应优先增加 dry-run 测试。不要在测试、示例或 Pull Request 中使用
真实账户凭据或发送真实订单。

## Pull Request

- 保持改动聚焦，不混入无关重构。
- 说明行为变化、风险边界和验证命令。
- 新工具或新策略事件应同步更新相关 README。
- 涉及真实交易路径时，说明失败处理、执行后复核和审计覆盖。
- UI 和审计 API 不得新增未经明确设计评审的交易执行能力。

项目不接受收益保证、操盘信号、返佣链接、交易所邀请码或伪造结果作为文档内容。
