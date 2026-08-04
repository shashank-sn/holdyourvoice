# VoiceDNA

VoiceDNA is a local, inspectable reference built from at least two author-owned samples. It describes repeatable mechanics that an editor can compare with a draft. It makes no identity or authorship claim and uploads nothing.

## The 13 elements

| Element | What the profile records | What a drift finding means |
| --- | --- | --- |
| 1. Sentence length | Mean words per sentence | The draft compresses or expands beyond the writer’s normal band. |
| 2. Sentence variation | Spread of sentence lengths | The draft is too even or too erratic for the reference. |
| 3. Sentence structure | Repeated opening word shapes | The argument starts moving in an unfamiliar way. |
| 4. Rhythm | Change in length between neighbouring sentences | The beat has flattened or become needlessly choppy. |
| 5. Paragraph length | Mean sentences per paragraph | The draft’s visual pacing has drifted. |
| 6. Opening moves | Common first words | The opening enters unlike the reference samples. |
| 7. Vocabulary | Frequent non-stop words | Familiar concrete language is missing or displaced. |
| 8. Lexical density | Share of non-stop words | The draft has become unusually generic or compressed. |
| 9. Point of view | First-, second-, third-person, or mixed | The writer’s normal narrative distance changed. |
| 10. Punctuation | Counts of selected marks | The draft uses emphasis or pauses unlike the reference. |
| 11. Case style | Lowercase, standard, or mixed | Capitalization no longer matches the writer’s convention. |
| 12. Question rate | Share of sentences ending in questions | The draft is asking far more or fewer questions than normal. |
| 13. Transitions | Recurrent logical connectors | The piece moves between ideas unlike the reference. |

The current gate emits findings for sentence length, avoid-list phrases, question rate, case style, and point of view. The remaining elements are included in the profile and tiered prompt as visible evidence; they become automatic release checks only after a rule has counterexamples and tests.

## current automated policy

the gates are deliberately narrow. an avoid-list match is red and fails VoiceDNA immediately. sentence-length drift is yellow when the sentence falls outside `max(8 words, 2.2 × profile variation)` from the profile mean. question-rate drift is yellow above 0.25. case style and a non-mixed point-of-view mismatch are yellow.

the counterexample is intentional variation: a technical explanation may need a longer sentence, a direct question can be the right opening, and a single quote can change point of view. yellow findings are review cues. only the explicit avoid list blocks release automatically. `src/voice-dna.test.ts` covers the minimum-sample boundary and the red avoid-list behavior; add positive and negative regression coverage before expanding this policy.

## Boundaries

VoiceDNA is a comparison tool. A low score means “different from these samples.” It cannot label writing bad, AI-written, or authored by another person. Use editorial judgment and preserve deliberate changes.
