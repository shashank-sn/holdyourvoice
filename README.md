# Hold Your Voice

An MIT-licensed, local-first writing gate that checks two different problems without blending them into one opaque score.

- **VoiceDNA** compares a draft with 13 observable elements from your local writing samples.
- **AI Editor** flags versioned editorial patterns that make writing generic, formulaic, or needlessly inflated.

The output is a tiered rewrite brief. A candidate rewrite must pass both engines again before it is accepted.

## What it does

| Command | Outcome |
| --- | --- |
| `profile` | Builds a portable VoiceDNA JSON profile from two or more local samples. |
| `analyze` | Returns separate VoiceDNA and AI Editor scores, findings, and pass states. |
| `rewrite-prompt` | Produces a priority-ordered editing brief for your chosen model or human editor. |
| `verify` | Rechecks a candidate, reports regressions, and exits non-zero when the dual gate fails. |
| `patterns` | Prints the deterministic AI Editor rules currently enabled. |

No account, API, MCP server, telemetry, payment collection, or network request is part of the runtime.

## Quick start

```bash
npm install
npm test
npx holdyourvoice profile profile.json samples/one.md samples/two.md
npx holdyourvoice analyze draft.md profile.json
npx holdyourvoice rewrite-prompt draft.md profile.json > rewrite-brief.md
npx holdyourvoice verify draft.md candidate.md profile.json
```

## The rewrite brief

The prompt is deliberately ordered. Lower tiers never override a higher tier.

1. **Tier 0 — preservation:** facts, names, numbers, and clean sentences stay intact.
2. **Tier 1 — blockers:** avoid-list violations and red findings must be fixed.
3. **Tier 2 — VoiceDNA:** 13 profile elements provide the writer-specific target.
4. **Tier 3 — AI Editor:** yellow findings offer precise editorial improvements.
5. **Tier 4 — output:** only targeted replacement sentences are returned.

This is a prompt generator, not a hosted model. Bring any model or editor you trust, then run `verify` on the result. Read the [full prompt contract](docs/PROMPT-CONTRACT.md) before changing prompt order.

## VoiceDNA

The profile captures sentence length, sentence variation, sentence structure, rhythm, paragraph length, opening moves, vocabulary, lexical density, point of view, punctuation, case style, question rate, and transitions. Read the full [VoiceDNA reference](docs/VOICE-DNA.md).

## Pattern catalog and safe automation

The owner-authored [220-pattern editorial catalog](docs/patterns/AI-WRITING-PATTERNS-1-220.md) is the complete reference. It includes spotting tests, ugly escalations, and legitimate exceptions. It is not an AI-authorship detector.

The automated ruleset is intentionally smaller: a catalog pattern becomes executable only after deduplication, counterexamples, public provenance review, and tests. That keeps the CLI honest about what it can reliably flag.

## Support

Hold Your Voice stays fully open source. [Sponsor its maintenance on GitHub](https://github.com/sponsors/shashank-sn) with a one-time or recurring sponsorship. Sponsorship does not unlock features, collect donor data here, or alter the privacy contract. See [SUPPORT.md](SUPPORT.md).

## Contributing and design docs

Read [the thesis](docs/THESIS.md), [architecture](docs/ARCHITECTURE.md), [pattern taxonomy](docs/PATTERN-TAXONOMY.md), [benchmark policy](docs/BENCHMARKS.md), and [SUPPORT.md](SUPPORT.md) before contributing.

## Privacy and data rights

Profiles are generated from files you choose and are never uploaded by this code. Do not commit client samples, edit history, embeddings, or any dataset without explicit rights and a provenance record.
