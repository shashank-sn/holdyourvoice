# faq and troubleshooting

## why did a candidate fail with a good score?

a red finding blocks release even if the numeric score is high. inspect the engine, rule ID, and sentence in the JSON report.

## why does verification return 2?

the candidate failed VoiceDNA, AI Editor, the new-red-regression check, or the 70 lexical-preservation guardrail. `apply-rewrite` and `apply-rebuild` use the same exit code when a candidate is not accepted. `2` means the candidate failed. `1` means the command had a usage or runtime error.

## when does a draft SHIP, EDIT, or REBUILD?

a pre-edit judgment reduces findings to one recommendation. SHIP returns the original bytes. EDIT unlocks eligible sentences or contiguous ranges. REBUILD needs a matching recommendation, a CopySpec, and a signed rebuild-authorization capability. a caller cannot self-select rebuild.

## can this prove authorship or factual accuracy?

no. VoiceDNA describes similarity to selected samples. AI Editor highlights configured patterns. lexical preservation cannot prove semantics or facts.

## why is a yellow finding still present?

yellow is a review cue. keep it when the sentence is intentional and works in context.
