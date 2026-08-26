# Tiered prompt contract

`rewrite-prompt` sends evidence in five tiers, with an optional editorial-context section, and leaves the writing to an editor or model outside the package. A lower tier may refine a higher tier, but never override it.

## Tier 0 — preservation

The model keeps facts, names, numbers, claims, and unflagged sentences unchanged. This prevents a smoother rewrite from changing the assignment or inventing evidence.

## Tier 1 — release blockers

Red findings and the profile avoid list are non-negotiable. The brief shows each affected sentence, the rule, and the repair direction. Treat every blocker as a required repair: remove the named defect rather than swapping in another stock phrase. The post-rewrite gate checks these again.

Repairs may use only facts already present in the draft, CopySpec, WritingBrief, or supplied local source context. A rewrite must never manufacture a source, metric, date, quotation, mechanism, example, CTA, or opinion.

## Tier 2 — VoiceDNA fidelity

The profile supplies the 13 observable elements of the writer’s mechanics. Treat them as targets and preserve deliberate variation. The model repairs only flagged sentences.

## Tier 3 — AI Editor improvements

Yellow findings are editorial opportunities: formulaic transitions, vague claims, manufactured contrast, and other repeatable patterns. A match never proves AI use. When a repair asks for a source, mechanism, or next step, use it only when it is already supported; otherwise remove the unsupported framing without widening the claim. Keep clean lines intact.

## Tier 3.5 — editorial context

When a WritingBrief is supplied, the prompt names the reader, intent, format, approved vocabulary, and whether the reader knows the author. Format-pack findings stay advisory unless the brief names an explicit prohibited term. This context leaves VoiceDNA measurements and its pass state unchanged.

## Tier 4 — output contract

The response contains only replacements keyed by sentence number. Before responding, the editor checks each Tier 1 finding against its replacement and confirms that the named defect is gone. The caller applies replacements deliberately, then uses `verify` to rerun the two engines, preservation, logic, supplied-source fact checks, and final-output hygiene.

Rebuild is a separate contract. It returns a whole-document candidate after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability. It does not use this sentence-replacement output contract, and it does not lower claim, polarity, hygiene, or semantic gates.

## Why the tiers matter

The order stops an LLM from treating stylistic preferences as permission to alter facts, and stops a generic style rule from overriding a writer’s documented voice. It makes a failed output explainable: the report identifies the engine, rule, sentence, and priority that failed.
