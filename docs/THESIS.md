# The Hold Your Voice thesis

Writing quality and voice fidelity are different checks. A draft can avoid generic AI texture while still sounding unlike its author. It can also match an author's short sentences while relying on empty persuasion templates. The system therefore keeps two engines separate and makes the rewrite layer accountable to both.

VoiceDNA is a local profile of observable mechanics from supplied samples: sentence-length distribution, common opening moves, preferred vocabulary, and an explicit avoid list. It makes no personality inference. Its score says how closely a draft stays within those declared and measured boundaries.

AI Editor is a public, versioned taxonomy of detectable writing patterns. Each rule has an ID, severity, reason, suggestion, and sentence-level finding. Rules give an editor concrete evidence for a decision.

The rewrite brief is a coordination layer. It receives both reports, tells a model or editor which sentences are eligible for change, and requires all clean sentences and source facts to remain intact. Generation and provider calls happen outside the package. The candidate needs a second check because a rewrite can replace one visible problem with a new one.

The acceptance policy is fail-closed: a candidate needs both engine passes, no newly introduced critical finding, and a minimum lexical-preservation score. This is intentionally stricter than averaging scores; an excellent AI Editor score cannot conceal a VoiceDNA failure.

The source product also explored feedback-derived voice memory. This repository excludes feedback history, accepted edits, embeddings, client profiles, and cloud storage. A future local memory feature must be opt-in, inspectable, bounded, and stored only by the user.
