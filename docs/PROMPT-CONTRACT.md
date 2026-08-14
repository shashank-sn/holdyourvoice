# Tiered prompt contract

`rewrite-prompt` sends evidence in five tiers, with an optional editorial-context section, and leaves the writing to an editor or model outside the package. A lower tier may refine a higher tier, but never override it.

## Tier 0 — preservation

The model keeps facts, names, numbers, claims, and unflagged sentences unchanged. This prevents a smoother rewrite from changing the assignment or inventing evidence.

## Tier 1 — release blockers

Red findings and the profile avoid list are non-negotiable. The brief shows each affected sentence, the rule, and the repair direction. The post-rewrite gate checks these again.

## Tier 2 — VoiceDNA fidelity

The profile supplies the 13 observable elements of the writer’s mechanics. Treat them as targets and preserve deliberate variation. The model repairs only flagged sentences.

## Tier 3 — AI Editor improvements

Yellow findings are editorial opportunities: formulaic transitions, vague claims, manufactured contrast, and other repeatable patterns. A match never proves AI use. Keep clean lines intact.

## Tier 3.5 — editorial context

When a WritingBrief is supplied, the prompt names the reader, intent, format, approved vocabulary, and whether the reader knows the author. Format-pack findings stay advisory unless the brief names an explicit prohibited term. This context leaves VoiceDNA measurements and its pass state unchanged.

## Tier 4 — output contract

The response contains only replacements keyed by sentence number. The caller applies them deliberately, then uses `verify` to rerun the two engines and factual-preservation check.

Rebuild is a separate contract. It returns a whole-document candidate after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability. It does not use this sentence-replacement output contract, and it does not lower claim, polarity, hygiene, or semantic gates.

## Why the tiers matter

The order stops an LLM from treating stylistic preferences as permission to alter facts, and stops a generic style rule from overriding a writer’s documented voice. It makes a failed output explainable: the report identifies the engine, rule, sentence, and priority that failed.
