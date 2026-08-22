# portable agents

HYV ships 23 portable agent packages for its writing and runtime commands. A host can load one operation without loading the full CLI or MCP server.

Each package lives at `skills/hyv-*/` and contains:

- `agent.json`: the versioned contract for the role, workflow phase, inputs, outputs, evidence, permissions, stop conditions, tool-free mode, and handoff.
- `SKILL.md`: the exact CLI usage and operating instructions.
- `agents/openai.yaml`: display metadata and a default prompt for hosts that use that interface.

The package tree is included in the published npm package. Installed copies of `hyv` can list, validate, describe, and emit the same contracts.

## Commands

```bash
hyv agent list
hyv agent validate [id]
hyv agent describe <id> [--host HOST]
hyv agent emit <id> --mode prompt|json [--host HOST] [--output FILE]
```

`agent list` prints every package with its role and workflow phase. `agent validate` checks the contract schema, package-directory identity, and handoff targets. A valid package prints `PASS`; an invalid or unknown package exits `1`.

`agent describe` resolves the package against a host capability catalog. The built-in host ids are `generic`, `codex`, `claude-code`, `cursor`, `copilot`, `gemini-cli`, `ide-agent`, `windsurf`, `cline`, and `roo-code`. Unknown host ids use the `generic` catalog.

`agent emit` writes either a prompt-only contract or a JSON runtime descriptor. Capabilities a host cannot provide carry an explicit status: `NOT_AVAILABLE`, `NOT_CONFIGURED`, `NOT_RUN`, `STALE`, or `ERROR`.

## Boundaries

The agent layer describes existing HYV operations. `hyv agent` reads the package tree and emits metadata. With `--output`, it creates a new contract file and refuses an existing target. Existing HYV commands execute writing workflows, and host policy controls permissions and network access.

Host policy remains the authority for repository reads, file writes, command execution, subagents, and network access. The emitted descriptor reports the capabilities the host provides.

## Examples

```bash
# Confirm that all published packages are valid.
hyv agent validate

# See how verification maps to Cursor capabilities.
hyv agent describe hyv-verify --host cursor

# Write a prompt-only contract for a generic host.
hyv agent emit hyv-rewrite-prompt --mode prompt --host generic --output rewrite-agent.md
```

Use `hyv agent validate` after changing a package. The command validates the complete tree by default, so a broken package or handoff cannot be hidden by validating only the package you touched.
