# tiered rewrite workflow

the brief has five fixed tiers. optional editorial context sits between AI Editor improvements and the output contract. it cannot override a higher tier.

1. preservation: keep facts, names, numbers, claims, and unflagged sentences.
2. release blockers: remove avoid-list phrases and red findings.
3. VoiceDNA fidelity: use all 13 profile elements as evidence.
4. AI Editor improvements: inspect yellow findings only where they help.
5. optional editorial context: use the supplied audience, intent, format, and vocabulary only where they stay accurate. never let them override preservation, release blockers, or the output contract.
6. output contract: return only replacement sentences keyed by sentence number.

the brief is a prompt generator. it never rewrites text or makes a provider call.

rebuild is a separate contract. after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability, the host returns a whole-document candidate. that path does not use sentence-number replacements. claim, polarity, hygiene, and semantic gates stay in force.
