---
problem: large orchestration functions made behavior-preserving changes hard to review
root_cause: command routing, policy decisions, calculations, and output handling lived in the same functions
fix: extract private named helpers while preserving public modules, exports, ordering, and error contracts
verification: compare public surfaces with the base commit, run differential cases, then test the packed artifact
links:
  - ../plans/2026-08-23-simplify-codebase.md
---

# Behavior-preserving codebase simplification

## problem

The largest orchestration functions mixed routing, validation, calculations, output, and error handling. A reviewer had to track several responsibilities at once to confirm that a small change was safe.

The npm package ships every file under `dist/`. Moving private logic between modules can therefore change a deep-import path even when the documented API stays the same.

## fix

Keep each public module and exported binding in place. Extract private helpers inside the same module, then leave the exported function as a short coordinator.

Apply the same boundary to output behavior:

- preserve finding and blocker order;
- preserve JSON property order where digests depend on canonical data;
- preserve CLI exit codes and error timing;
- preserve fixed redacted MCP errors for sensitive inputs.

Keep strict schema and capability validators explicit. Their repeated conditions encode fail-closed policy and should stay easy to audit.

## verification

Use several checks because the unit suite covers only part of the compatibility contract:

1. Compare CLI commands, usage errors, MCP catalogs, portable agents, built modules, exported bindings, and package file paths with the base commit.
2. Run exact differential cases for extracted policy and calculation flows.
3. Run the full test suite, release audit, and Claude extension build.
4. Pack the npm artifact, install it in a clean project, and test a documented command plus a known deep import.
5. Watch pull-request CI on the exact pushed commit.

The detailed requirements and recorded baseline are in the linked simplification plan.
