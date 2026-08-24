# Codex MCP setup

Register the local command `hyv mcp` as a stdio MCP server in a workspace that already has `@holdyourvoice/hyv` installed. After connecting, call `hyv_mcp_capabilities`. Start with `hyv_analyze`, `hyv_verify`, `hyv_fact_lint`, and `hyv_final_check`; pass only text you authorize the host to receive. The server does not call a model or network service.
