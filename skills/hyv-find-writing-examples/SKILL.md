---
name: hyv-find-writing-examples
description: Find redacted excerpts from explicit local writing samples in memory only.
---

# hyv-find-writing-examples

Use the `hyv_find_writing_examples` MCP tool with a query and one to 64 explicit local `{ basename, text }` samples. It returns at most three ranked excerpts, redacts sensitive values, exposes basenames only, and never writes a corpus or index.

Pass approved examples to `hyv_rewrite_prompt` only as advisory cadence evidence. They cannot override preservation, facts, AI Editor blockers, or final-output checks.
