# 项目本地 Skills

本仓库把项目专用 skills 放在 `.cursor/skills/` 下。

当用户明确提到 `$trading-v2`、`trading-v2`、`V2.txt`，或要求按 V2 运行交易流程时：

1. 先读取 `.cursor/skills/trading-v2/SKILL.md`。
2. 把该文件视为项目本地 skill 正文并遵循其说明。
3. 相对引用、脚本、资产和 agent 元数据都从 `.cursor/skills/trading-v2/` 解析。
4. 不要依赖、创建或更新 `~/.codex/skills/trading-v2` 下的用户全局副本。
5. 如果项目本地 skill 文件缺失或不可读，明确说明并在执行任何 V2 交易流程前停止。

当用户明确提到 `$trading-v3`、`trading-v3`、`V3.txt` 自由裁量交易，或要求按 V3 运行交易流程时：

1. 先读取 `.cursor/skills/trading-v3/SKILL.md`。
2. 把该文件视为项目本地 skill 正文并遵循其说明。
3. 相对引用、脚本、资产和 agent 元数据都从 `.cursor/skills/trading-v3/` 解析。
4. 不要依赖、创建或更新 `~/.codex/skills/trading-v3` 下的用户全局副本。
5. 如果项目本地 skill 文件缺失或不可读，明确说明并在执行任何 V3 交易流程前停止。
