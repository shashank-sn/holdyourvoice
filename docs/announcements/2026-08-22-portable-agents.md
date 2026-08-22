# Portable agents are in HYV

2026-08-22

HYV now ships 23 portable agent packages for its writing and runtime commands.

Each package carries a model-neutral contract, operating instructions, and host interface metadata. A host can load the command it needs instead of taking on the full CLI or MCP server.

```bash
hyv agent list
hyv agent validate
hyv agent describe hyv-verify --host codex
hyv agent emit hyv-rewrite-prompt --mode prompt --host generic
```

The agent layer stays local. It reads the package tree, describes host capabilities, and emits a prompt or JSON descriptor. With `--output`, it creates a new contract file and refuses an existing target. Existing HYV commands execute workflows, and host policy controls file changes, permissions, and network access.

Every package lives under `skills/hyv-*/` with three files:

- `agent.json` for the contract
- `SKILL.md` for the exact CLI instructions
- `agents/openai.yaml` for host interface metadata

The packages ship with `@holdyourvoice/hyv`, so the same commands work from an installed copy. Read the [portable agents guide](../wiki/Portable-Agents.md) for the host catalog, status model, and more examples.
