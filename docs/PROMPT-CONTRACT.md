# Tiered prompt contract

`rewrite-prompt` sends evidence in five tiers and leaves the writing to an editor or model outside the package. A lower tier may refine a higher tier, but never override it.

## Tier 0 — preservation

The model keeps facts, names, numbers, claims, and unflagged sentences unchanged. This prevents a smoother rewrite from changing the assignment or inventing evidence.

## Tier 1 — release blockers

Red findings and the profile avoid list are non-negotiable. The brief shows each affected sentence, the rule, and the repair direction. The post-rewrite gate checks these again.

## Tier 2 — VoiceDNA fidelity

The profile supplies the 13 observable elements of the writer’s mechanics. Treat them as targets and preserve deliberate variation. The model repairs only flagged sentences.

## Tier 3 — AI Editor improvements

Yellow findings are editorial opportunities: formulaic transitions, vague claims, manufactured contrast, and other repeatable patterns. A match never proves AI use. Keep clean lines intact.

## Tier 4 — output contract

The response contains only replacements keyed by sentence number. The caller applies them deliberately, then uses `verify` to rerun the two engines and factual-preservation check.

## Why the tiers matter

The order stops an LLM from treating stylistic preferences as permission to alter facts, and stops a generic style rule from overriding a writer’s documented voice. It makes a failed output explainable: the report identifies the engine, rule, sentence, and priority that failed.
