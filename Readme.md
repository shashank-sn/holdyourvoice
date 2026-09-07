# hold your voice

[![npm downloads](https://img.shields.io/npm/dt/%40holdyourvoice%2Fhyv?label=npm%20downloads&color=2f81f7)](https://www.npmjs.com/package/@holdyourvoice/hyv)

hold your voice (`hyv`) checks writing locally. it compares a draft with your writing samples, flags generic writing patterns, and checks an edited candidate before you use it. you supply the writing and the edits; hyv supplies inspectable findings and verification.

it works through a command-line tool, an mcp server, and portable agent contracts. it needs node.js 20 or newer. it makes no model calls and needs no account or api key.

## what it does

| check or workflow | result |
| --- | --- |
| voice dna | compares sentence structure, rhythm, vocabulary, punctuation, and other measurements with a local profile. |
| ai editor | flags deterministic wording and structural patterns, with sentence locations and repair guidance. |
| profiles | builds v2 or v3 profiles, assesses sample readiness, composes profiles, watches local sample files, and scores against held-out samples. |
| fact and logic checks | compares claims with supplied source files and checks document structure, required facts, and claim polarity. |
| hidden-text checks | inspects unicode controls, applies an explicit removal policy, and gates the exact final text. |
| delivery checks | optionally checks placeholders, likely secrets, local links, and supplied citation ids offline. |
| editing and rebuilding | prepares fingerprint-bound tasks, accepts a supplied response, preserves locked text or required claims, and verifies the candidate. |
| review and approval | binds semantic judgments and signed approval capabilities to the exact candidate. |
| local learning | records explicit instructions or verified repairs and applies profile revision and authority rules. |
| evaluation | runs local backtests, synthetic comparisons, and evidence-bound benchmark workflows. |

voice fit, generic-pattern findings, factual evidence, and approval stay separate. a passing check does not prove authorship, truth, or publication quality.

## install

```bash
npm install --global @holdyourvoice/hyv
```

for a one-off command, replace `hyv` with `npx @holdyourvoice/hyv`.

## check and edit a draft

build a profile from at least two writing samples you have the right to use:

```bash
hyv profile profile.json samples/one.md samples/two.md
hyv analyze draft.md profile.json
```

`analyze` returns separate voice dna, ai editor, and hygiene reports. hygiene is informational here; use `final-check` to gate delivery.

create an editing brief, give it to your editor or a model you choose, then check the candidate:

```bash
hyv rewrite-prompt draft.md profile.json > rewrite-brief.md
hyv verify draft.md candidate.md profile.json
hyv final-check candidate.md
```

before verification, the editing brief asks for a word economy review: **every word must earn its place.** cut filler, repeated ideas, and needless setup when removing them loses no meaning, evidence, clarity, or voice. preserve necessary uncertainty, attribution, emphasis, and rhythm. this is an editor or model judgment, not an automatic score or a word-count target. edits must stay within the authorized scope.

rewrite and verification commands are strict by default: every active ai editor finding must be repaired. a v3 profile can deliberately disable a rule. verification also checks preservation, logic, required facts when supplied, and final-output hygiene. it does not record learning.

`final-check` writes accepted text to stdout. it removes a leading byte-order mark; unresolved hidden characters withhold output and return exit code `2`. run it after the last edit or formatting change. stdin works too:

```bash
producer | hyv final-check -
```

## commands

most commands return json. exit code `0` means completion, `2` means a content or policy gate failed, and `1` means invalid input or a command error. run a command without enough arguments for its usage, or read the [full cli reference](docs/wiki/CLI-Reference.md).

| command | purpose |
| --- | --- |
| `profile <output> <sample...>` | build a v2 profile; repeat `--avoid=phrase` for blocked phrases. |
| `profile v3 <output> --id=writer.channel --channel=email <sample...>` | build a revisioned, digest-bound v3 profile. |
| `profile assess <sample...>` | check sample readiness. |
| `profile compose --ratio 70:30 <profile...>` | combine v3 measurements and conservative rule policies. |
| `profile watch ...` | rebuild a local profile as its sample files change. |
| `team-profile validate\|compose ...` | work with consent-bound team metadata. |
| `ingest ...` | import owner-authorized gmail or telegram exports into redacted local samples. |
| `analyze <draft> <profile>` | run the writing checks. |
| `score <draft> <profile-v3> <heldout...>` | compare against a separate local writing range; abstain when evidence is inadequate. |
| `strict-check <draft> <profile-v3> <sample...>` | return `strict-ready`, `needs-human-review`, or `blocked` using calibrated voice evidence. |
| `dispositions <draft> <profile>` | normalize findings into `block`, `review`, and `signal`. |
| `patterns` | print the active rule catalog. |
| `batch-analyze <draft...>` | find repeated openings and endings. |
| `fact-lint <draft\|-> --source=id:path` | check claims against supplied local sources. |
| `logic-lint <draft\|-> [brief.json]` | check deterministic document logic. |
| `hygiene <draft> [--fix]` | inspect hidden characters or write a conservative cleaned copy. |
| `inspect-hidden-text <draft> [policy.json]` | inspect with an optional hidden-text policy. |
| `apply-hidden-text-policy <draft> <policy.json> <output>` | apply explicitly permitted removals. |
| `final-check <path\|->` | gate the exact output text. |
| `delivery-check <path\|-> [policy.json]` | run the separate optional delivery check. |
| `rewrite-prompt <draft> <profile>` | prepare a constrained editing brief. |
| `prepare-rewrite ...` / `apply-rewrite ...` | prepare and verify sentence replacements or range edits. |
| `prepare-judgment ...` / `reduce-judgment ...` | collect and reduce pre-edit or post-candidate judgments. |
| `prepare-rebuild ...` / `rebuild-writer-request ...` / `apply-rebuild ...` | run a whole-document rebuild with required claims and signed authorization. |
| `verify <original> <candidate> <profile>` | verify an edited candidate. |
| `verify-spec ...` | also enforce a `CopySpec` claim contract. |
| `lifecycle ...` | prepare semantic review, submit verdicts, inspect state, and finalize approval or rejection. |
| `learning ...` | inspect, add, ratify, supersede, migrate, or clear local learning. |
| `backtest ...` / `evaluate-local ...` | evaluate supplied candidates locally without generating writing. |
| `agent list\|validate\|describe\|emit` | inspect or emit portable agent contracts. |
| `mcp` | start the local server over standard input/output. |

`strict-check` requires a v3 profile built from at least five samples, plus five non-duplicate validation samples with a consistent visible format and at least 1,500 words in total.

whole-document rebuilding requires an upstream `REBUILD` recommendation, a `CopySpec`, and a signed `hyv.rebuild-authorization` capability. it checks required claims instead of enforcing the ordinary lexical preservation threshold. semantic review and final approval remain separate steps. see the [workflow and architecture](docs/ARCHITECTURE.md) and [recomposition contract](docs/RECOMPOSITION.md).

## use with an agent

start the mcp server with `hyv mcp`. compatible hosts can call the same local checks through tools. the `skills/hyv-*` packages describe inputs, outputs, evidence, permissions, and stop conditions for agent workflows.

```bash
hyv agent list
hyv agent validate
```

setup guides: [codex](docs/CODEX.md), [claude desktop](docs/CLAUDE-DESKTOP.md), [claude code](docs/CLAUDE-CODE.md), and [portable agents](docs/wiki/Portable-Agents.md).

## local data

hyv has no runtime network requests, telemetry, hosted analysis, or profile sync. samples, drafts, profiles, candidates, and source files stay local unless you choose to send them elsewhere.

learning lives under `~/.hyv/learning/` by default. verified-repair events store findings and hashes rather than draft text. explicit learning instructions store the instruction itself. approval trust is loaded separately from a permission-checked local context. private samples and approval keys do not belong in a public repository.

## version 4 and development

version 4 rebuilds the implementation boundaries while retaining the existing cli commands, mcp contracts, profile formats, deep-import paths, rules, and agent packages. existing profiles need no migration. verification artifacts include the package version: prepare fresh version-bound tasks and approvals after upgrading.

start with [architecture](docs/ARCHITECTURE.md) to find the owner of a behavior. the compatibility check compares the rebuilt implementation with the frozen v3 source, including serialized outputs and errors.

```bash
npm ci
npm test
npm run check:release
npm run pack:claude
```

read [contributing](CONTRIBUTING.md), [rule authoring](docs/RULE-AUTHORING.md), the [roadmap](docs/ROADMAP.md), and the [wiki](https://github.com/shashank-sn/holdyourvoice/wiki). existing [runtime measurements](benchmarks/runtime/README.md) describe their recorded fixtures and revisions; they are not a new version 4 performance claim. public synthetic scorecards do not measure human preference.

## license

[mit](LICENSE). third-party writing and data keep their own rights.
