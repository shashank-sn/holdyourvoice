# core concepts

VoiceDNA asks whether a draft resembles observable mechanics in local samples. AI Editor asks whether a sentence matches one small, configured editorial pattern. their scores never average together.

A WritingBrief is optional local context for audience, intent, format, vocabulary, and explicit prohibited terms. It can also carry an evidence state and a four-part argument map: observation, mechanism, consequence, and reader value. These remain advisory editorial context and do not change VoiceDNA measurements, profile storage, or the default analysis result. Batch analysis separately catches exact repeated opening and closing sentences across a local set of drafts.

Profile v3 applies catalog policy after matching. a rule can block, advise, require judgment, or stay disabled without changing its catalog ID.

pre-edit judgments reduce findings to SHIP, bounded EDIT, or REBUILD. SHIP returns original bytes. EDIT unlocks only eligible sentences or contiguous ranges. REBUILD is a separate whole-document contract: it needs a matching recommendation, a CopySpec, and a signed rebuild-authorization capability. edit and rebuild responses are mutually incompatible.

the combined `passed` value is logical AND. verification adds two safeguards: no new red finding and at least 70 lexical preservation. authorized rebuild may keep a lower lexical-survival floor while claim, polarity, hygiene, and semantic gates stay in force. this makes the decision visible instead of hiding it behind a single quality score.

the tool is a gate around an editor or a model you choose. generation happens outside the package.
