---
name: hyv-mcp
description: Start the local Hold Your Voice MCP server.
---

# hyv-mcp

Start the local Hold Your Voice MCP server over stdio. The server registers the writing tools for MCP-capable hosts. It sends no drafts, samples, profiles, or telemetry to any service.

## Usage

```text
hyv mcp
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv mcp` directly to execute the operation.
