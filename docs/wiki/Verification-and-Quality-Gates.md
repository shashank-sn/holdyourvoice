# verification and quality gates

`verify` runs both engines on the original and candidate. it reports regressions by engine, rule ID, and sentence, alongside a lexical-preservation score.

a candidate passes only when VoiceDNA passes, AI Editor passes, no new red regression appears, and lexical preservation is at least 70. lexical preservation only measures retained longer words. a human must still check facts, intent, and sources.

use exit code `2` for a failed candidate and exit code `1` for a usage or runtime failure.

CopySpec checks are deterministic. A normal immutable claim must remain verbatim. When a claim includes `atoms`, each declared phrase must remain in the candidate, which permits independent facts to be split or reordered. Atoms are lexical-presence checks, so place the whole relationship in one atom when it is immutable. CopySpec preserves declared text; it does not establish whether a claim is true.
