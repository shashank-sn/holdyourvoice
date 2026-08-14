# VoiceDNA: 13 elements

VoiceDNA is a local profile of observable writing mechanics. Build it from at least two non-empty samples from one writer. It compares a draft with those samples; it does not identify an author or determine whether AI wrote a passage.

Structural measurements accept Unicode writing. The current point-of-view and transition lists are English-specific evidence.

| Element | What it records | What drift means |
| --- | --- | --- |
| 1. Sentence length | Mean words per sentence | The draft is materially shorter or longer than the reference. |
| 2. Sentence variation | Spread of sentence lengths | The draft is unusually even or erratic. |
| 3. Sentence structure | Frequent three-word opening shapes | Sentences begin in unfamiliar patterns. |
| 4. Rhythm | Length change between neighbouring sentences | The beat has flattened or become needlessly choppy. |
| 5. Paragraph length | Mean sentences per paragraph | Visual pacing has drifted. |
| 6. Opening moves | Common first words | The piece enters unlike the reference samples. |
| 7. Vocabulary | Frequent non-stop words | Familiar concrete language is missing or displaced. |
| 8. Lexical density | Share of non-stop words | The draft is unusually generic or compressed. |
| 9. Point of view | First-, second-, third-person, or mixed | Normal narrative distance changed. |
| 10. Punctuation | Counts of selected marks | Emphasis or pauses differ from the reference. |
| 11. Case style | Lowercase, standard, or mixed | Capitalization no longer matches the writer’s convention. |
| 12. Question rate | Share of sentences ending in questions | The draft asks materially more or fewer questions. |
| 13. Transitions | Frequent recognised connectors | The movement between ideas differs from the reference. |

## Current automated policy

- Explicit avoid-list phrases are red release blockers.
- Sentence-length drift is a yellow review cue outside `max(8 words, 2.2 × profile variation)` from the reference mean.
- Question-rate, case-style, and non-mixed point-of-view drift are yellow review cues.
- The remaining elements stay visible in the JSON profile and rewrite brief as evidence for an editor.

Yellow findings ask for editorial judgment. They do not prove a line is wrong. Any new automatic rule needs a written policy, positive tests, and counterexamples.

Profile v3 adds a stable local identity and per-rule policy. Catalog matches can block, advise, require judgment, or stay disabled without changing rule IDs. Revision compatibility decides which local learning events stay active.
