import type { CopySpec, CopySpecVerification, DeterministicVerificationArtifactV1, Profile, Verification, WritingBrief } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { HYV_VERSION } from './version.js';
import { verifyClaims } from './copy-spec.js';
import { finalOutputCheck } from './hygiene.js';
import type { LearningPreference } from './learning.js';
import { legacySetPreservation, LEGACY_SET_PRESERVATION_VERSION } from './preservation.js';
import { lintFacts } from './fact-linter.js';
import { lintLogic } from './logic-linter.js';
import { sentences } from './text.js';
import { digestCanonical, escaped as escapeRegex, profileIdentity, sha256 as digest } from './internal.js';
import type { LocalWritingExcerpt } from './writing-examples.js';
import { analyze, analysisFindings, isBlockingFinding, strictFindings } from './analysis.js';
import { renderRewritePrompt } from './rewrite-prompt.js';

export { analyze, deriveEditScope, isBlockingFinding, isStrictFinding, strictFindings } from './analysis.js';
export { renderRewritePrompt } from './rewrite-prompt.js';

export function rewritePrompt(draft: string, profile: Profile, learning: LearningPreference[] = [], brief?: WritingBrief, examples: LocalWritingExcerpt[] = []): string {
  return renderRewritePrompt(draft, profile, analyze(draft, profile, brief), learning, brief, examples);
}

function compareCandidates(original: string, candidate: string, profile: Profile, brief?: WritingBrief) {
  const baseline = analyze(original, profile, brief);
  const checked = analyze(candidate, profile, brief);
  const baselineFindings = analysisFindings(baseline);
  const checkedFindings = analysisFindings(checked);
  const known = new Set(baselineFindings.map((finding) => `${finding.engine}:${finding.id}:${finding.sentence}`));
  const regressions = checkedFindings.filter((finding) => !known.has(`${finding.engine}:${finding.id}:${finding.sentence}`));
  const preservation = legacySetPreservation(original, candidate).score;
  return { baseline, checked, regressions, preservation };
}

function verifyRequiredFacts(candidate: string, brief?: WritingBrief) {
  if (!brief?.requiredFacts?.length) return undefined;
  const result = verifyClaims(candidate, {
    version: '1', audience: brief.audience, intent: brief.intent, channel: brief.format,
    claims: brief.requiredFacts.map((fact) => ({ ...fact, evidence: 'WritingBrief required fact.' })),
  });
  const draftSentences = sentences(candidate);
  const reversed = brief.requiredFacts.filter((fact) => {
    const terms = fact.atoms?.length ? fact.atoms : [fact.text];
    return terms.some((term) => {
      const escaped = escapeRegex(term);
      const quotedDenial = new RegExp(`${escaped}(?:["']|\\s)*(?:is|was|are|were)?\\s*(?:not|false|untrue|incorrect)`, 'i');
      return quotedDenial.test(candidate) || draftSentences.some((sentence, index) => sentence.text.toLowerCase().includes(term.toLowerCase()) && (/\b(?:not|false|untrue|incorrect)\b/i.test(sentence.text) || /^(?:that|this) (?:statement|claim|fact|assertion|point) (?:is|was) (?:not|false|untrue|incorrect)\b/i.test(draftSentences[index + 1]?.text.trim() ?? '')));
    });
  });
  if (!reversed.length) return result;
  return { ...result, passed: false, failures: [...result.failures, ...reversed.map((fact) => ({ id: fact.id, code: 'missing_immutable_claim' as const, message: `Required fact ${fact.id} is negated or denied.`, evidence: 'WritingBrief required fact.' }))] };
}

function verifyCandidate(original: string, candidate: string, profile: Profile, brief: WritingBrief | undefined, rebuild: { copySpec: CopySpec }): CopySpecVerification;
function verifyCandidate(original: string, candidate: string, profile: Profile, brief?: WritingBrief): Verification;
function verifyCandidate(original: string, candidate: string, profile: Profile, brief?: WritingBrief, rebuild?: { copySpec: CopySpec }): Verification | CopySpecVerification {
  const { baseline, checked, regressions, preservation } = compareCandidates(original, candidate, profile, brief);
  const claims = rebuild ? verifyClaims(candidate, rebuild.copySpec) : undefined;
  const finalOutput = finalOutputCheck(candidate);
  const logicLint = lintLogic(candidate, brief);
  const factLint = brief?.factSources?.length ? lintFacts({ sources: brief.factSources, draft: candidate, metadata: brief.factMetadata }) : undefined;
  const requiredFacts = verifyRequiredFacts(candidate, brief);
  const unresolvedStrictFindings = strictFindings(checked);
  const preservationPassed = claims ? claims.passed : preservation >= 70;
  const factsPassed = !factLint?.findings.some((finding) => finding.severity === 'error') && (requiredFacts?.passed ?? true);
  const analysisPassed = checked.passed && unresolvedStrictFindings.length === 0 && !regressions.some(isBlockingFinding);
  return {
    version: '2',
    original: baseline,
    candidate: checked,
    preservationScore: preservation,
    regressions,
    strictFindings: unresolvedStrictFindings,
    ...(claims ? { claims } : {}),
    finalOutput,
    logicLint,
    ...(factLint ? { factLint } : {}), ...(requiredFacts ? { requiredFacts } : {}),
    passed: analysisPassed && preservationPassed && finalOutput.accepted && logicLint.passed && factsPassed,
  };
}

export function verify(original: string, candidate: string, profile: Profile, brief?: WritingBrief): Verification {
  return verifyCandidate(original, candidate, profile, brief);
}

export function verifyWithCopySpec(original: string, candidate: string, profile: Profile, spec: CopySpec, brief?: WritingBrief): CopySpecVerification {
  const verification = verify(original, candidate, profile, brief);
  const claims = verifyClaims(candidate, spec);
  return { ...verification, claims, passed: verification.passed && claims.passed };
}

export function verifyRebuildWithCopySpec(original: string, candidate: string, profile: Profile, spec: CopySpec, brief?: WritingBrief): CopySpecVerification {
  return verifyCandidate(original, candidate, profile, brief, { copySpec: spec });
}

function projectDeterministicVerificationArtifact(
  source: string, candidate: string, profile: Profile,
  verification: Verification | CopySpecVerification, copySpec?: CopySpec, writingBrief?: WritingBrief,
  verificationKind: DeterministicVerificationArtifactV1['verificationKind'] = 'claims' in verification ? 'copy_spec' : 'standard',
): DeterministicVerificationArtifactV1 {
  const identity = profileIdentity(profile);
  const base = {
    version: '1' as const, verificationKind, passed: verification.passed, analysisVersion: verification.candidate.version,
    rulesetVersion: HYV_VERSION, preservationMetricVersion: LEGACY_SET_PRESERVATION_VERSION, preservationScore: verification.preservationScore,
    sourceHash: digest(source), candidateHash: digest(candidate), ...identity,
    ...(copySpec ? { copySpecHash: digestCanonical(copySpec) } : {}), ...(writingBrief ? { writingBriefHash: digestCanonical(writingBrief) } : {}),
    regressionKeys: verification.regressions.map((finding) => `${finding.engine}:${finding.id}:${finding.sentence}`).sort(),
    ...('claims' in verification ? { claimFailureKeys: verification.claims.failures.map((failure) => `${failure.id}:${failure.code}`).sort() } : {}),
  };
  return { ...base, artifactFingerprint: digest(`hyv:deterministic-verification:v1\0${canonicalJson(base)}`) };
}

export function verifyDeterministically(source: string, candidate: string, profile: Profile, copySpec?: CopySpec, writingBrief?: WritingBrief): { verification: Verification | CopySpecVerification; artifact: DeterministicVerificationArtifactV1 } {
  const verification = copySpec ? verifyWithCopySpec(source, candidate, profile, copySpec, writingBrief) : verify(source, candidate, profile, writingBrief);
  return { verification, artifact: projectDeterministicVerificationArtifact(source, candidate, profile, verification, copySpec, writingBrief) };
}

export function verifyRebuildDeterministically(source: string, candidate: string, profile: Profile, copySpec: CopySpec, writingBrief?: WritingBrief): { verification: CopySpecVerification; artifact: DeterministicVerificationArtifactV1 } {
  const verification = verifyRebuildWithCopySpec(source, candidate, profile, copySpec, writingBrief);
  return { verification, artifact: projectDeterministicVerificationArtifact(source, candidate, profile, verification, copySpec, writingBrief, 'rebuild') };
}
