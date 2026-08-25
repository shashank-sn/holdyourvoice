# HYV 3.5 local writing evidence plan

status: implementation-ready

## decision and boundaries

HYV 3.5 remains a local deterministic writing gate. It will not train a model, call a model at runtime, silently capture writing, publish text, or rewrite drafts.

Three questions remain separate:

1. Does the draft contain deterministic AI-writing patterns?
2. Does the draft sit inside the selected writer and channel's held-out range?
3. Can user-chosen local messages become approved samples without retaining secrets or third-party text?

strict-ready is a narrow quality disposition. It is not evidence of authorship, factual truth, permission to publish, or a claim that a draft is human-written.

Sources and decisions:

- Wikipedia Signs of AI Writing is a descriptive field guide, not a detector. HYV rules stay advisory, judgment-required, or explicitly configured blocking policy.
- Humanizer provides the 35-pattern comparison set, sample-overrides-default behavior, prose-only file handling, and install UX reference. It is not a dependency or rewrite engine.
- Ghostwriter supports structural, rhythm, and formatting cues. HYV keeps AI Editor separate from VoiceDNA instead of blending them into one score.
- write-like-me supports channel profiles, explicit opt-in capture, redaction, and held-out scoring. Telemetry and automatic updates are excluded.
- write-like-me-mcp supports local-only storage, derived-only profiles, socket-denial tests, and language abstention.
- WeClone supports Telegram Desktop JSON, whole-sentence blocklists, and PII removal as ingest ideas. Its trainer, LoRA path, and deployment are excluded.

## non-negotiable policy

- Preserve independent voice_dna, ai_editor, hygiene, fact, and logic results. Do not collapse them into one score.
- A sample may override a default AI Editor rule only through a V3 profile allowance with derived, non-verbatim evidence. It cannot override explicit blocking policy, hidden-text failure, fact/logic checks, or another profile.
- Raw source prose, messages, redaction maps, and excerpt indexes remain outside a repository and package artifact.
- Capture is explicit opt-in. Hooks and browser integration require a named local destination and a redaction receipt.
- Language confidence that is inadequate for scoring returns abstain.

## Humanizer 35-pattern map

Every added rule needs public provenance, a positive example, a counterexample, an intended-impact statement, catalog implementation, tests, serialization coverage, and a changelog entry. Fixtures use invented or public text only.

| # | Pattern | Current state | 3.5 rule/action | Default |
| --- | --- | --- | --- | --- |
| 1 | inflated significance/legacy | partial | ai.inflated-significance | judgment-required |
| 2 | name-dropping for importance | missing | ai.notability-name-drop | judgment-required |
| 3 | shallow trailing -ing analysis | missing | ai.shallow-participle-analysis | judgment-required |
| 4 | promotional scene-setting | partial lexicon | ai.promotional-scene-setting | advisory |
| 5 | vague attribution | missing in AI Editor | ai.vague-attribution | judgment-required |
| 6 | challenges/outlook ending | missing | ai.challenges-outlook | advisory |
| 7 | dense AI vocabulary | present | retain; later density aggregate | advisory |
| 8 | avoids is/are | missing | ai.copula-avoidance, narrow stacked form | advisory |
| 9 | not-X-but-Y | present | retain with exact fixture | advisory |
| 10 | forced group of three | partial | ai.forced-triplet | advisory |
| 11 | repeated openings/changing names | missing | ai.repeated-sentence-opening | advisory |
| 12 | fake from-X-to-Y range | missing | ai.false-range | judgment-required |
| 13 | actorless claim | missing | ai.actorless-claim, narrow phrases only | advisory |
| 14 | em/en dash | present | retain; profile allowance eligible | policy-dependent |
| 15 | bold density | missing | format.bold-density | advisory |
| 16 | bold mini-heading bullet | missing | format.bold-bullet-label | advisory |
| 17 | title-case heading | missing | format.title-case-heading | advisory |
| 18 | emoji heading | missing | format.emoji-heading | advisory |
| 19 | curly quotes | intentionally non-universal | format.curly-quotes profile-sensitive cue | advisory |
| 20 | chatbot residue | partial | ai.chatbot-offer | judgment-required |
| 21 | knowledge-limit disclaimer | missing | ai.knowledge-limit-disclaimer | judgment-required |
| 22 | agreeable preamble | partial | ai.agreement-preamble | advisory |
| 23 | filler phrase | present | retain existing struct/formula rules | advisory |
| 24 | qualifier stack | partial | ai.qualifier-stack | advisory |
| 25 | generic positive ending | missing | ai.generic-positive-ending | advisory |
| 26 | hyphenated modifier stack | missing | format.hyphenated-modifier-stack | advisory |
| 27 | fake deeper truth | missing | ai.at-its-core | judgment-required |
| 28 | announces next point | partial | ai.section-announcement for missing forms | advisory |
| 29 | heading repeated in body | missing | format.repeated-heading-body | advisory |
| 30 | obsolete implementation aside | missing | ai.historical-implementation-aside | advisory |
| 31 | forced punchline/fragments | partial | ai.clipped-fragment-run | advisory |
| 32 | formulaic saying | missing | ai.formulaic-aphorism | advisory |
| 33 | fake-candid opening | partial | ai.fake-candid-opener | advisory |
| 34 | unraised objection | missing | ai.unraised-objection | judgment-required |
| 35 | fake alternative | missing | ai.fake-alternative | judgment-required |

Examples belong with each fixture: inflated legacy: “marking a pivotal moment in the evolution of” becomes a supported fact; shallow analysis: “highlighting its importance” becomes the supported fact; fake range: “from the Big Bang to dark matter” becomes two named topics; at-its-core: remove the announcement; unraised objection and fake alternative retain only a real claim or real choice.

## implementation units

### U1: catalog, protected regions, and profile allowances

Goal: add missing deterministic 35-pattern coverage without turning patterns into authorship claims.

Files: ai-editor-rules, ai-editor, contracts, profile, voice-dna, AI editor/profile tests, rule fixtures, rule docs, rule changelog, CLI/MCP/portable agents where profile shape is exposed.

Approach:

- Add the mapped stable IDs with narrow expressions. Contextual patterns default to judgment-required. Formatting and rhythm cues default to advisory.
- Add V3 ruleAllowances: known rule ID plus a stable derived sample-evidence digest/count. Reject unknown IDs and allowance plus explicit blocking policy. Explicit blocking always wins.
- Parse protected regions before AI rule matching. Exclude fenced code, frontmatter values, inline-code spans, URLs, Markdown link targets, and image targets. Continue examining prose in headings and list bodies.
- Profile allowance applies only to the default policy. It never suppresses a configured block, hygiene failure, fact/logic result, or another profile.

Verification:

- positive/counterexample fixture for every new ID;
- allowance suppresses only an eligible default finding;
- explicit block overrides allowance;
- two profiles cannot share an allowance;
- protected regions never trigger while adjacent prose still does.

### U2: channels, advisory tone, and held-out score

Goal: replace a fake universal match number with an honest held-out voice-band report.

Files: new profile-score module/tests, contracts, profile parser, CLI/MCP, score portable agent, docs.

Approach:

- Add profile channel: email, chat, long-form, social, docs, or general.
- Add optional advisory tone metadata: formality, confidence, warmth, energy, complexity (all 0–1). It never drives generation or blocks a draft.
- Add hyv score candidate profile-v3 heldout-samples. Return all 13 component distances, self-similarity ceiling measured across held-out peer pairs, coverage, language confidence, and inside_band/review/abstain. Do not call it an authorship score.
- Insufficient heldout count, channel mismatch, sparse coverage, or low language confidence returns abstain.
- Profile compose ratio follows only after score components are stable. Numeric metrics interpolate; categorical metrics use documented deterministic tie rules; all safety/AI policies intersect rather than blend away.

Verification: train/holdout paragraph isolation, self-similarity ceiling, channel/language abstention, deterministic ratio math, policy precedence.

### U3: privacy-safe local ingest

Goal: turn user-selected sent-message exports into candidate samples without repository or package leakage.

Files: new ingest modules/tests, CLI/MCP, ingest portable agent, privacy docs, package exclusions.

Approach:

- Parse Gmail Takeout Sent.mbox and Telegram Desktop JSON locally. Select messages authored by configured owner only.
- Apply deterministic email, phone, card-like, IP, and URL redaction. A blocked_words list drops the containing sentence. A Presidio adapter is optional only when installed; absence must report NOT_CONFIGURED.
- Raw normalized samples write only to a user-selected location outside a Git checkout. Receipt contains counts, redaction categories, dropped sentence counts, and source digests, never raw text.
- Watch/rebuild is later, opt-in, debounced, and cannot write repository data.

Verification: no sockets, no raw sentences/paths in profiles or receipts, source untouched, owner filtering, redaction/blocklist behavior, clean-package exclusion.

### U4: retrieval and isolated backtest

Goal: ground a host-provided rewrite in local evidence and evaluate it without HYV becoming a generator.

- A separately approved local excerpt index may return 2–3 redacted excerpts with basenames only to rewrite-prompt.
- A backtest receives context, held-out target, and a caller-supplied candidate. It returns preservation, AI Editor, and held-out band results separately.
- Synthetic AI-tell fail fixtures may be generated only in development/CI and then frozen. No runtime LLM calls.

## verification contract

| Requirement | Proof |
| --- | --- |
| rules are versioned and bounded | fixture validator, tests, catalog serialization, changelog |
| allowance is bounded | parser, policy-precedence, and cross-profile isolation tests |
| non-prose is protected | Markdown protected-region fixtures |
| score is honest | heldout split, self-similarity, channel/language abstention tests |
| ingest remains private | socket denial, no-verbatim receipt/profile, package and output-location tests |
| agents remain accurate | agent validate plus emitted-contract checks |
| release remains intact | npm test, release audit, Claude pack, npm dry-run, clean install smoke |

## sequence

1. U1 first: rules, profile allowances, protected regions, tests, and agents.
2. U2 next: channels and held-out score.
3. U3 only after privacy contract and local storage choice are approved.
4. U4 only after U3 privacy tests and a separate excerpt-review decision.

## deferred

Model training, LoRA, hosted writers, automatic writing changes, telemetry, background capture, Gmail/Telegram OAuth, browser extension publishing, corpus sync, and non-English scoring until language-specific fixtures exist.
