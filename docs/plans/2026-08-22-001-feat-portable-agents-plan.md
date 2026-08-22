---
artifact_contract: portable-agent-plan/v1
artifact_readiness: implementation-ready
product_contract_source: clean-code-portable-agents
execution: code
title: "feat: Expose HYV CLI commands as portable agents"
type: feat
date: 2026-08-22
---

# feat: Expose HYV CLI commands as portable agents

## Goal Capsule

- **Objective:** Make every `hyv` CLI command available as a model-neutral portable agent, mirroring the pattern in the `shashank-sn/clean-code` repository, so any host can load the full writing gate as discrete, individually invokable agents. Each of the 23 top-level commands maps 1:1 to one agent package.
- **Authority:** The existing `src/cli.ts` command surface and `src/mcp.ts` tool registrations define the behavior boundary. The clean-code portable-agent contract (`skills/clean-*/agent.json` + `SKILL.md` + `agents/openai.yaml` + `agent list|validate|describe|emit` CLI) defines the delivery pattern.
- **Execution profile:** Contract-first, 1:1 command-to-agent mapping, CLI and MCP parity preserved, dependency-ordered. No behavior changes to existing commands.
- **Stop conditions:** Stop if a proposed agent would change existing command exit codes, mutate profiles or drafts, weaken the local-first no-telemetry contract, or claim a host capability the package cannot guarantee.
- **Tail ownership:** Finish with agent-contract validation, docs, a `hyv agent` subcommand, and a release that does not break the existing CLI or MCP surfaces.

---

## Product Contract

### Summary

HYV exposes 23 deterministic CLI commands plus a parallel MCP tool set. Today both surfaces are registered in `src/cli.ts` and `src/mcp.ts` but there is no host-neutral way to load an individual operation as an agent. Clean-code solved this by giving each workflow step a portable agent package: a `SKILL.md` (instructions), an `agent.json` (contract: role, phase, inputs, outputs, evidence, permissions, stop conditions, tool-free mode, handoff), an `agents/openai.yaml` (interface metadata), and a CLI that lists, validates, describes, and emits these packages per host.

This plan adds the same portable-agent layer to HYV without touching the behavior of any existing command. Each command becomes one agent package under a new `skills/hyv-*/` directory tree, plus a `hyv agent` subcommand to list, validate, describe, and emit them.

### Problem Frame

- The full HYV writing gate is a 23-command surface. A host that wants "just the verify step" currently loads the whole CLI or the whole MCP server.
- The MCP tools encode behavior descriptions inline (`src/mcp.ts`), but they are host-specific (MCP) and cannot be emitted as standalone prompt-only agents for hosts without MCP or native tool support.
- There is no validation that a command's documented role, inputs, outputs, permissions, or handoff targets are consistent, so drift between docs, CLI usage, and MCP descriptions is possible.
- Clean-code already solved this exact shape; HYV should reuse the contract rather than invent a parallel one.

### Requirements

**Agent contract**

- R1. Every top-level `hyv` CLI command (all 23 usage entries) maps to exactly one portable agent package with a stable lowercase id prefixed `hyv-`.
- R2. Each package contains a model-neutral `agent.json` with `schema_version`, `id`, `title`, `description`, `instruction_file`, `role`, `workflow_phase`, `input`, `output`, `evidence_requirements`, `permissions`, `stop_conditions`, `tool_free_mode`, and `handoff_to`.
- R3. Each package contains a `SKILL.md` that describes when and how to invoke the command, the exact usage, and what it returns, without inventing host capabilities.
- R4. Each package contains an `agents/openai.yaml` interface file (display name, short description, default prompt) so hosts can surface it.
- R5. The package `id` must match its directory name (`skills/hyv-<cmd>/`), and handoff targets must reference existing agent ids.

**CLI**

- R6. `hyv agent list` lists all portable agent packages with their role and phase.
- R7. `hyv agent validate [id]` validates every package (or one) against the contract schema and reports `PASS` or `FAIL` with reason.
- R8. `hyv agent describe <id> [--host HOST]` emits a runtime descriptor resolving the package's permissions against a host capability catalog.
- R9. `hyv agent emit <id> --mode prompt|json [--host HOST] [--output FILE]` emits a prompt-only or JSON portable agent contract for the given host.
- R10. The `agent` subcommand never grants permissions; repository and host policy remain the authority for file edits, command execution, and network access.

**Host model**

- R11. A built-in host catalog resolves known hosts (`generic`, `codex`, `claude-code`, `cursor`, `copilot`, `gemini-cli`, `ide-agent`, `windsurf`, `cline`, `roo-code`) and falls back to `generic` for unknown ids, mirroring clean-code's `internal/hosts`.
- R12. Unavailable capabilities report exactly one of `NOT_AVAILABLE`, `NOT_CONFIGURED`, `NOT_RUN`, `STALE`, or `ERROR`; a prompt-only agent never claims a tool action it cannot perform.

**Safety and parity**

- R13. The agent layer adds zero behavior change: it only reads command usage and emits contracts. It never executes a writing command, mutates a profile or draft, or changes an exit code.
- R14. All agent packages and the `agent` subcommand stay local-first; they send no drafts, samples, profiles, or telemetry to any service.
- R15. Every command retains its existing CLI and MCP behavior; the agent layer is additive.

### Acceptance Examples

- AE1. **1:1 coverage.** Given the current usage line listing all 23 commands, when `hyv agent list` runs, then every command id is present and each maps to exactly one `skills/hyv-*/agent.json`.
- AE2. **Validate passes.** Given all packages authored, when `hyv agent validate` runs, then it returns `PASS` and lists no schema, id/directory, or handoff-target errors.
- AE3. **Emit is host-aware.** Given the `hyv-verify` package, when `hyv agent emit hyv-verify --mode prompt --host codex` runs, then output includes the full instruction contract and marks capabilities the host cannot provide as unavailable.
- AE4. **No behavior drift.** Given any command, when run before and after adding the agent layer, then exit codes, stdout, and stderr are byte-identical.
- AE5. **Generic fallback.** Given an unknown host id, when `hyv agent describe hyv-verify --host future-ide` runs, then the runtime resolves to the `generic` catalog entry.
- AE6. **Local-first.** Given the agent subcommand and packages in use, then no network call occurs and no draft, sample, profile, or telemetry leaves the machine.

### Scope Boundaries

**In scope**

- New `skills/hyv-*/` package tree (one per command), `agent.json`, `SKILL.md`, `agents/openai.yaml`, a host capability catalog, and a `hyv agent` subcommand (`list`, `validate`, `describe`, `emit`).
- Docs for the agent layer and the portable-agent contract.

**Deferred to follow-up work**

- Emitting native host rule files (Cursor `.mdc`, Claude `CLAUDE.md`, etc.) into a repository — this plan only emits the portable contract, matching clean-code's `agent emit` scope.
- Rewriting existing command implementations.
- Publishing a separate plugin/marketplace for the agents.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Reuse the clean-code contract shape verbatim.** Adopt `schema_version: 1.0.0`, the same `agent.json` field set, the same valid permission and status enumerations, and the same `agents/openai.yaml` interface. This keeps the two projects mutually loadable and auditable.
- KTD2. **One agent per top-level command.** Each of the 23 usage entries becomes its own package with a stable id prefixed `hyv-`. The `lifecycle` and `learning` umbrella commands each get one package whose `SKILL.md` documents their subcommand surfaces. This gives 1:1 traceability and lets a host load a single operation.
- KTD3. **Author the agent layer in TypeScript in the existing package.** Unlike clean-code's Go CLI, HYV is a Node/TS package; the `hyv agent` subcommand lives in `src/cli.ts` and reuses existing validation utilities, with a new `src/agents/` module for loading, validation, host resolution, and emission.
- KTD4. **Keep the MCP server as the runtime tool surface.** The agent packages are the host-neutral contract; MCP tools remain the executing runtime. They share the same command behavior (R15) and do not conflict.
- KTD5. **Separate contract authoring from execution.** `agent.json` and `SKILL.md` describe an operation; only the existing command functions execute it. The agent subcommand is read-only over the package tree.
- KTD6. **Package tree lives under `skills/` at the repo root.** This matches clean-code's layout, so the tree is discoverable and can be shipped or consumed as a directory without bundling into `dist` (kept out of the runtime build; read from source in development and from an installed `skills/` directory in published packages).

### High-Level Technical Design

```text
holdyourvoice/
  skills/
    hyv-profile/                agent.json  SKILL.md  agents/openai.yaml
    hyv-analyze/                agent.json  SKILL.md  agents/openai.yaml
    hyv-hygiene/                agent.json  SKILL.md  agents/openai.yaml
    hyv-inspect-hidden-text/    agent.json  SKILL.md  agents/openai.yaml
    hyv-apply-hidden-text-policy/ agent.json SKILL.md agents/openai.yaml
    hyv-final-check/            agent.json  SKILL.md  agents/openai.yaml
    hyv-fact-lint/              agent.json  SKILL.md  agents/openai.yaml
    hyv-logic-lint/             agent.json  SKILL.md  agents/openai.yaml
    hyv-batch-analyze/          agent.json  SKILL.md  agents/openai.yaml
    hyv-rewrite-prompt/         agent.json  SKILL.md  agents/openai.yaml
    hyv-prepare-rewrite/        agent.json  SKILL.md  agents/openai.yaml
    hyv-apply-rewrite/          agent.json  SKILL.md  agents/openai.yaml
    hyv-prepare-judgment/       agent.json  SKILL.md  agents/openai.yaml
    hyv-reduce-judgment/        agent.json  SKILL.md  agents/openai.yaml
    hyv-prepare-rebuild/        agent.json  SKILL.md  agents/openai.yaml
    hyv-rebuild-writer-request/ agent.json  SKILL.md  agents/openai.yaml
    hyv-apply-rebuild/          agent.json  SKILL.md  agents/openai.yaml
    hyv-verify/                 agent.json  SKILL.md  agents/openai.yaml
    hyv-verify-spec/            agent.json  SKILL.md  agents/openai.yaml
    hyv-lifecycle/              agent.json  SKILL.md  agents/openai.yaml
    hyv-learning/               agent.json  SKILL.md  agents/openai.yaml
    hyv-patterns/               agent.json  SKILL.md  agents/openai.yaml
    hyv-mcp/                    agent.json  SKILL.md  agents/openai.yaml
  src/
    agents/
      catalog.ts      # host capability catalog + resolve()
      load.ts         # load + validate packages from skills/
      emit.ts         # describe + emit (prompt / json)
      catalog.test.ts
      load.test.ts
      emit.test.ts
    cli.ts            # add `agent` subcommand dispatch
    cli.test.ts       # extend for agent subcommand
```

### Sequencing

1. Add `src/agents/` module: host catalog, loader, validator, emitter — with tests.
2. Author the `skills/hyv-*/` package tree (agent.json, SKILL.md, agents/openai.yaml) for all commands.
3. Wire the `hyv agent list|validate|describe|emit` subcommand into `src/cli.ts`.
4. Add docs and run full regression (existing CLI + MCP tests) to confirm zero behavior drift.

### Assumptions

- The agent layer is additive and never changes existing command behavior, exit codes, or MCP tool behavior.
- Host capability resolution follows the clean-code model; unknown hosts fall back to `generic`.
- The `skills/` tree is shipped with the published package so installed users can emit agents, mirroring how clean-code ships its `skills/` directory in `files`.
- No network, telemetry, or provider call is introduced anywhere in the agent layer.

---

## Implementation Units

### U1. Add the agent core module (`src/agents/`)

- **Goal:** Provide load, validate, describe, and emit for portable agent packages.
- **Requirements:** R6-R12; covers AE2, AE3, AE5.
- **Dependencies:** None.
- **Files:** `src/agents/catalog.ts`, `src/agents/load.ts`, `src/agents/emit.ts`, `src/agents/catalog.test.ts`, `src/agents/load.test.ts`, `src/agents/emit.test.ts`.
- **Approach:** Mirror clean-code's `internal/agents` and `internal/hosts` in TypeScript. `catalog.ts` defines the host capability map and `resolve(id)` with `generic` fallback. `load.ts` walks `skills/hyv-*`, parses each `agent.json` with strict (unknown-field-rejecting) decoding, enforces `schema_version`, id/directory match, required field presence, valid permission and status enumerations, and handoff-target existence, and reads the `SKILL.md` instructions. `emit.ts` builds a runtime descriptor (available/unavailable capabilities, execution mode) and renders either a prompt-only contract or JSON, with the capability boundary and required `NOT_AVAILABLE`-family statuses.
- **Patterns to follow:** clean-code `internal/agents/*.go` validation and emission logic; existing HYV strict JSON helpers in `src/canonical-json.ts`.
- **Test scenarios:**
  1. `load` accepts a valid package and rejects an unknown `schema_version`.
  2. `load` rejects an id that does not match its directory name.
  3. `load` rejects a handoff target that does not exist.
  4. `validate` returns `PASS` over all authored packages and `FAIL` with a reason for a seeded broken one.
  5. `describe`/`emit` resolve an unknown host to `generic`.
  6. `emit --mode prompt` includes instructions and marks unsupported capabilities as unavailable.

### U2. Author the `skills/hyv-*/` package tree

- **Goal:** Create one portable agent package per HYV command.
- **Requirements:** R1-R5, R13-R15; covers AE1, AE4, AE6.
- **Dependencies:** U1.
- **Files:** `skills/hyv-profile/`, `skills/hyv-analyze/`, `skills/hyv-hygiene/`, `skills/hyv-inspect-hidden-text/`, `skills/hyv-apply-hidden-text-policy/`, `skills/hyv-final-check/`, `skills/hyv-fact-lint/`, `skills/hyv-logic-lint/`, `skills/hyv-batch-analyze/`, `skills/hyv-rewrite-prompt/`, `skills/hyv-prepare-rewrite/`, `skills/hyv-apply-rewrite/`, `skills/hyv-prepare-judgment/`, `skills/hyv-reduce-judgment/`, `skills/hyv-prepare-rebuild/`, `skills/hyv-rebuild-writer-request/`, `skills/hyv-apply-rebuild/`, `skills/hyv-verify/`, `skills/hyv-verify-spec/`, `skills/hyv-lifecycle/`, `skills/hyv-learning/`, `skills/hyv-patterns/`, `skills/hyv-mcp/` — each with `agent.json`, `SKILL.md`, `agents/openai.yaml`.
- **Approach:** For each command, read the exact usage from `src/cli.ts`, write a `SKILL.md` that describes when to call it, the exact usage, and the output, an `agent.json` that records role/phase/inputs/outputs/evidence/permissions/stop conditions/tool-free mode/handoff, and an `agents/openai.yaml` interface. Use the safe permission subset (`read_repository`, `write_repository`, `execute_commands`, `subagents` as applicable) and never claim `network` since HYV is local-first. Handoff chains follow the editing loop (analyze → rewrite-prompt → prepare-rewrite → apply-rewrite → verify → lifecycle → learning).
- **Patterns to follow:** clean-code `skills/clean-*/agent.json` and `SKILL.md`; the documented usage strings in `docs/wiki/CLI-Reference.md`.
- **Test scenarios:**
  1. Every command id in the usage line has exactly one package (AE1).
  2. `hyv agent validate` passes over the full tree (AE2).
  3. Each `SKILL.md` mentions the exact usage and never claims a host capability the command does not use.
  4. `agent.json` permission sets exclude `network` and `browser_automation`.

### U3. Wire the `hyv agent` subcommand into the CLI

- **Goal:** Expose `list`, `validate`, `describe`, `emit` through the existing `hyv` command.
- **Requirements:** R6-R10; covers AE2, AE3.
- **Dependencies:** U1, U2.
- **Files:** `src/cli.ts`, `src/cli.test.ts`.
- **Approach:** Add `agent` dispatch in `runCli`, mirroring how `lifecycle` and `learning` dispatch subcommands today. `agent list` prints ids/roles/phases; `agent validate [id]` returns `PASS`/`FAIL`; `agent describe <id> [--host]` prints the runtime descriptor; `agent emit <id> --mode prompt|json [--host] [--output]` writes the contract. Usage errors and unknown ids return `1` (the repo-wide convention); a failed validation returns `1`; success returns `0`. Add the `agent` id to the usage line and keep the command read-only over the package tree.
- **Patterns to follow:** the existing subcommand dispatch in `src/cli.ts` for `lifecycle` and `learning`.
- **Test scenarios:**
  1. `hyv agent list` prints all command ids once.
  2. `hyv agent validate` returns `PASS` and exit `0`; a seeded broken package returns `FAIL` and exit `1`.
  3. `hyv agent emit hyv-verify --mode prompt --host codex` writes the expected contract; `--output` writes to the named file.
  4. `hyv agent emit` without a required flag returns a usage error and exit `1` (matching the repo-wide usage-error convention); `agent validate` on an unknown id returns exit `1`.
  5. Running an unrelated existing command (e.g. `hyv analyze`) still returns byte-identical output (AE4).

### U4. Docs and regression

- **Goal:** Document the agent layer and confirm zero behavior drift.
- **Requirements:** R13-R15; covers AE4, AE6.
- **Dependencies:** U3.
- **Files:** `docs/wiki/CLI-Reference.md`, `Readme.md`, `src/cli.test.ts`, `src/mcp.test.ts`.
- **Approach:** Document `hyv agent list|validate|describe|emit` and the portable-agent contract in the wiki CLI reference. Run the full existing test suite (`npm test`) and a sample of command invocations before/after to confirm exit codes and output are unchanged. Confirm no network usage in the agent path.
- **Patterns to follow:** existing CLI-Reference wiki format; existing `npm test` regression gate.
- **Test scenarios:**
  1. Full `npm test` passes with the new module and CLI dispatch included.
  2. CLI-Reference documents all four `agent` subcommands and the package layout.
  3. A diff of representative command output before/after the change is empty.

---

## Verification Contract

| Requirement | Check | Track |
|---|---|---|
| R1 1:1 command→agent | `hyv agent list` count equals usage-line command count (23); each id present once | unit, acceptance |
| R2 agent.json schema | `hyv agent validate` over full tree returns PASS | unit, integration |
| R3 SKILL.md present and accurate | loader reads `SKILL.md` for every package; usage strings match CLI | unit |
| R4 openai.yaml present | every package contains `agents/openai.yaml` | unit |
| R5 id/directory and handoff integrity | `validate` rejects mismatches and unknown handoff targets | unit |
| R6-R9 agent subcommands | CLI tests for list/validate/describe/emit | unit, acceptance |
| R10 read-only, no grant | `agent` never calls a writing command; tests assert no mutation | unit |
| R11 host catalog + generic fallback | catalog tests resolve known and unknown hosts | unit |
| R12 unavailable statuses | emit includes `NOT_AVAILABLE`-family statuses | unit |
| R13-R15 additive, local-first | full `npm test` passes; no network in agent path | integration, human spot check |

---

## Definition of Done

- `hyv agent list` enumerates all 23 command ids, each once.
- `hyv agent validate` returns `PASS` with zero schema, id/directory, or handoff errors.
- `hyv agent emit` produces a host-aware prompt or JSON contract, including unavailable-capability statuses.
- Existing CLI and MCP test suites pass unchanged; representative command output is byte-identical before/after.
- Docs cover the four `agent` subcommands and the package layout.
- The agent layer makes no network call and never mutates a profile or draft.

## Deferred to Implementation Questions

- Resolved during implementation: `lifecycle` and `learning` expose one agent package each (umbrella), with subcommand detail in `SKILL.md`.
- Resolved during implementation: the published npm package ships the `skills/` tree in `files` so installed users can emit agents.
- Open: emitting native host rule files (Cursor `.mdc`, Claude `CLAUDE.md`, etc.) into a repository is deferred to follow-up; this plan only emits the portable contract.
