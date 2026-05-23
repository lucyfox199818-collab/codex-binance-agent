# Project-Local Skills

This repository keeps project-specific skills under `.cursor/skills/`.

When the user explicitly mentions `$codex-trading-brain`, `codex-trading-brain`,
or asks to use the trading brain skill in this repository:

1. Read `.cursor/skills/codex-trading-brain/SKILL.md` before responding or
   taking action.
2. Treat that file as the project-local skill body and follow its instructions.
3. Resolve relative references, scripts, assets, and agent metadata from
   `.cursor/skills/codex-trading-brain/`.
4. Do not rely on, create, or update a user-global copy under
   `~/.codex/skills/codex-trading-brain`.
5. If the project-local skill file is missing or unreadable, say so clearly and
   stop before any trading workflow action.

