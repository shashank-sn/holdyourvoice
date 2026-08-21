# Logic linter plan

## Problem

HYV can already reject AI-pattern regressions, hygiene failures, unsupported sourced claims, and unsafe rewrite output. None of those gates establishes that a complete post keeps one subject, develops a coherent argument, or avoids contradicting itself. The logic linter closes that gap at the candidate verification boundary.

## Research synthesis

This design uses four separate signals because no single metric is a reliable proxy for a logical post.

1. Entity continuity: entity-grid research treats the movement of salient entities across sentences as a measurable local-coherence signal. A post that abruptly introduces a new entity without a bridge is often digressing. [Barzilay and Lapata, 2008](https://aclanthology.org/J08-1001/); [de S. Dias and Pardo, 2015](https://aclanthology.org/W15-5619/)
2. Discourse structure: RST-based evaluation improves coherence assessment by representing relations between text spans, but parser error makes it unsuitable as a deterministic release blocker here. [Guz et al., 2020](https://aclanthology.org/2020.aacl-main.67/)
3. Argument mechanics: support and attack depend on factual consistency, sentiment, causal, and normative relations. This motivates checking explicit causal and contrast transitions against the surrounding statements. [Jo et al., 2021](https://aclanthology.org/2021.tacl-1.44/)
4. Long-form failures: topic drift accumulates during open-ended generation; document-level contradiction needs its own check. [Xu et al., 2023](https://aclanthology.org/2023.emnlp-main.66/); [Contradoc, 2024](https://aclanthology.org/2024.naacl-long.362/)

The research also argues against calling a linter factual verification or human judgment. Document-level automatic measures have known domain and calibration limits. [TRUE, 2022](https://arxiv.org/abs/2204.04991); [Ruiz-Dolz and Lawrence, 2023](https://aclanthology.org/2023.argmining-1.1/)

## Product contract

`lintLogic(draft, writingBrief?)` returns a deterministic, inspectable report. It never calls a model, retrieves sources, changes text, or treats a pass as a factual or publishing approval.

Hard blockers:

- an internally contradictory statement pair with the same normalized predicate and opposite polarity;
- an explicit contrast or inference connector whose adjacent clauses have no shared subject anchor;
- a declarative sentence after the two-sentence opening setup, with at least five content anchors and no continuity anchor to the post's dominant topic, its neighbours, or the optional `WritingBrief.argumentMap`.

Review findings:

- a low-confidence topic shift;
- a conclusion that introduces an unrelated subject;
- an argument-map dimension with no detectable anchor in the post.

Short posts (fewer than three sentences) receive no drift verdict. They are too small for this gate to infer document scope reliably.

## Implementation units

1. `src/logic-linter.ts`: sentence segmentation, normalized content anchors, connector-aware local checks, global-topic comparison, contradiction detection, deterministic report formatting.
2. `src/contracts.ts`: public report and finding types; add the optional report to verification.
3. `src/pipeline.ts`: run logic lint on the final candidate and fail verification only on error findings.
4. `src/cli.ts` and MCP: expose `hyv logic-lint` and `hyv_logic_lint`; existing `verify` automatically includes the final gate.
5. Tests: focused rule fixtures, pipeline/CLI/MCP parity, and a checked-in 54-post corpus spanning marketing, engineering, and deep tech.

## Verification contract

| Requirement | Evidence |
| --- | --- |
| Identify real digressions | Failing fixtures for abrupt topic shifts and unrelated conclusions |
| Preserve legitimate transitions | Passing fixtures for explicit bridges and multi-topic but connected posts |
| Detect self-contradiction | Failing same-predicate/opposite-polarity fixtures |
| Final gate actually blocks | `verify` test asserts `passed: false` on logic errors |
| No source or human-approval overclaim | Report has explicit limitations and only logic errors influence this gate |
| Cross-surface parity | CLI and MCP tests assert the same report shape and pass/fail result |
| Domain resilience | 54 authored posts of 350–1,500 words, 18 each for marketing, engineering, and deep tech |

## Scope boundaries

The first version is English-only and deterministic. It does not parse RST, perform NLI, assess factual truth, grade rhetoric, or approve publication. An optional model-backed semantic evaluator may later consume this report, but it must remain a separate, explicitly configured judgment layer.
