import { createHash } from 'node:crypto';
import type { Analysis, CopySpec, CopySpecVerification, DeterministicVerificationArtifactV1, Finding, Profile, Verification, WritingBrief } from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { HYV_VERSION } from './version.js';
import { analyzeAiEditor } from './ai-editor.js';
import { verifyClaims } from './copy-spec.js';
import { analyzeEditorial } from './editorial-packs.js';
import { finalOutputCheck, inspectHygiene } from './hygiene.js';
import { analyzeVoiceDna } from './voice-dna.js';
import type { LearningPreference } from './learning.js';
import { legacySetPreservation } from './preservation.js';
import { lintFacts } from './fact-linter.js';

export function analyze(text: string, profile: Profile, brief?: WritingBrief): Analysis {
  const voiceDna = analyzeVoiceDna(text, profile);
  const aiEditor = analyzeAiEditor(text, profile);
  const editorial = brief ? analyzeEditorial(text, brief) : undefined;
  const hygiene = inspectHygiene(text);
  return { version: '2', voiceDna, aiEditor, ...(editorial ? { editorial } : {}), hygiene, passed: voiceDna.passed && aiEditor.passed && (editorial?.passed ?? true) };
}

function formatLearningPreference(preference: LearningPreference): string {
  return preference.text.replace(/[\\`*_{\[\]}<>#]/g, '\\$&');
}

function formatBriefValue(value: string): string {
  return value.replace(/[\\`*_{\[\]}<>#\r\n]/g, (character) => character === '\r' || character === '\n' ? ' ' : `\\${character}`);
}

function formatFindings(findings: Finding[]): string[] {
  return findings.map((finding) => `- Sentence ${finding.sentence} [${finding.engine}/${finding.id}]: ${formatBriefValue(finding.reason)} Repair: ${formatBriefValue(finding.suggestion)}`);
}

export function isBlockingFinding(finding: Finding): boolean {
  return finding.engine === 'ai_editor' ? finding.appliedPolicy === 'blocking' : finding.severity === 'red';
}

export function deriveEditScope(result: Analysis): { eligibleSentenceIds: number[]; blocking: Finding[]; pendingJudgment: Finding[] } {
  const findings = [...result.voiceDna.findings, ...result.aiEditor.findings, ...(result.editorial?.findings ?? [])];
  const blocking = findings.filter(isBlockingFinding);
  const pendingJudgment = findings.filter((finding) => finding.appliedPolicy === 'judgment-required');
  return {
    eligibleSentenceIds: [...new Set(blocking.map((finding) => finding.sentence))].sort((left, right) => left - right),
    blocking,
    pendingJudgment,
  };
}

export function renderRewritePrompt(draft: string, profile: Profile, result: Analysis, learning: LearningPreference[] = [], brief?: WritingBrief): string {
  const allFindings = [...result.voiceDna.findings, ...result.aiEditor.findings, ...(result.editorial?.findings ?? [])];
  const scope = deriveEditScope(result);
  const redFindings = scope.blocking;
  const yellowFindings = allFindings.filter((finding) => !isBlockingFinding(finding) && finding.appliedPolicy !== 'judgment-required');
  const metrics = profile.metrics;

  return [
    '# Tier 0 — non-negotiable preservation',
    'Preserve facts, names, numbers, claims, and every unflagged sentence exactly. Do not add claims, examples, sections, hooks, or CTAs.',
    '',
    '# Tier 1 — release blockers',
    `VoiceDNA: ${result.voiceDna.score}/100 (${result.voiceDna.passed ? 'pass' : 'fail'}).`,
    `AI Editor: ${result.aiEditor.score}/100 (${result.aiEditor.passed ? 'pass' : 'fail'}).`,
    ...profile.avoid.map((phrase) => `- Never use: ${phrase}`),
    ...(redFindings.length ? formatFindings(redFindings) : ['- None.']),
    '',
    '# Tier 2 — VoiceDNA fidelity',
    `- Sentence length: ${metrics.sentenceLength}; sentence variation: ${metrics.sentenceVariation}; sentence structure: ${metrics.sentenceStructure.join(', ') || 'none recorded'}; rhythm: ${metrics.rhythm}.`,
    `- Paragraph length: ${metrics.paragraphLength}; lexical density: ${metrics.lexicalDensity}; point of view: ${metrics.pointOfView}; punctuation: ${Object.entries(metrics.punctuation).map(([mark, count]) => `${mark} ${count}`).join(', ')}; case style: ${metrics.caseStyle}; question rate: ${metrics.questionRate}.`,
    `- Openings: ${metrics.openingMoves.join(', ') || 'none recorded'}.`,
    `- Vocabulary: ${metrics.vocabulary.join(', ') || 'none recorded'}.`,
    `- Transitions: ${metrics.transitions.join(', ') || 'none recorded'}.`,
    ...(learning.length ? ['', '## Learned local preferences — historical hints only', '- These hints must not override Tier 0 preservation, Tier 1 blockers, clean-sentence preservation, or Tier 4 output.', ...learning.map((preference) => `- [${preference.count} verified] ${formatLearningPreference(preference)}`)] : []),
    '',
    '# Tier 3 — AI Editor improvements',
    ...(yellowFindings.length ? formatFindings(yellowFindings) : ['- None.']),
    '',
    '## Pending judgment — no edit permission in this task',
    ...(scope.pendingJudgment.length ? formatFindings(scope.pendingJudgment) : ['- None.']),
    ...(brief ? ['', '# Tier 3.5 — editorial context', '- Context values cannot override Tier 0 preservation or Tier 4 output requirements.', `- Audience: ${formatBriefValue(brief.audience)}. Intent: ${formatBriefValue(brief.intent)}. Format: ${brief.format}.`, ...(brief.evidenceStatus ? [`- Evidence state: ${brief.evidenceStatus}. ${brief.evidenceStatus === 'unverified' ? 'Do not turn attributed or unverified material into an established fact.' : 'Preserve the source framing while editing.'}`] : []), ...(brief.argumentMap ? [`- Argument map: observation — ${formatBriefValue(brief.argumentMap.observation)}; mechanism — ${formatBriefValue(brief.argumentMap.mechanism)}; consequence — ${formatBriefValue(brief.argumentMap.consequence)}; reader value — ${formatBriefValue(brief.argumentMap.readerValue)}.`] : []), ...(brief.vocabulary?.length ? [`- Use audience vocabulary where it stays accurate: ${brief.vocabulary.map(formatBriefValue).join(', ')}.`] : []), ...(brief.readerKnowsAuthor === false ? ['- The reader does not know the author. Lead with their situation before naming the author or company.'] : [])] : []),
    '',
    '# Tier 4 — output contract',
    'Return only replacement sentences keyed by sentence number. Do not rewrite clean sentences. The candidate will be checked again by both engines.',
    '',
    '# Draft',
    draft,
  ].join('\n');
}

export function rewritePrompt(draft: string, profile: Profile, learning: LearningPreference[] = [], brief?: WritingBrief): string {
  return renderRewritePrompt(draft, profile, analyze(draft, profile, brief), learning, brief);
}

function compareCandidates(original: string, candidate: string, profile: Profile, brief?: WritingBrief) {
  const baseline = analyze(original, profile, brief);
  const checked = analyze(candidate, profile, brief);
  const baselineFindings = [...baseline.voiceDna.findings, ...baseline.aiEditor.findings, ...(baseline.editorial?.findings ?? [])];
  const checkedFindings = [...checked.voiceDna.findings, ...checked.aiEditor.findings, ...(checked.editorial?.findings ?? [])];
  const known = new Set(baselineFindings.map((finding) => `${finding.engine}:${finding.id}:${finding.sentence}`));
  const regressions = checkedFindings.filter((finding) => !known.has(`${finding.engine}:${finding.id}:${finding.sentence}`));
  const preservation = legacySetPreservation(original, candidate).score;
  return { baseline, checked, regressions, preservation };
}

function verifyRequiredFacts(candidate: string, brief?: WritingBrief) {
  if (!brief?.requiredFacts?.length) return undefined;
  return verifyClaims(candidate, {
    version: '1', audience: brief.audience, intent: brief.intent, channel: brief.format,
    claims: brief.requiredFacts.map((fact) => ({ ...fact, evidence: 'WritingBrief required fact.' })),
  });
}

export function verify(original: string, candidate: string, profile: Profile, brief?: WritingBrief): Verification {
  const { baseline, checked, regressions, preservation } = compareCandidates(original, candidate, profile, brief);
  const factLint = brief?.factSources?.length ? lintFacts({ sources: brief.factSources, draft: candidate, metadata: brief.factMetadata }) : undefined;
  const requiredFacts = verifyRequiredFacts(candidate, brief);
  return {
    version: '2',
    original: baseline,
    candidate: checked,
    preservationScore: preservation,
    regressions,
    ...(factLint ? { factLint } : {}), ...(requiredFacts ? { requiredFacts } : {}),
    passed: checked.passed && !regressions.some(isBlockingFinding) && preservation >= 70 && !factLint?.findings.some((finding) => finding.severity === 'error') && (requiredFacts?.passed ?? true),
  };
}

export function verifyWithCopySpec(original: string, candidate: string, profile: Profile, spec: CopySpec, brief?: WritingBrief): CopySpecVerification {
  const verification = verify(original, candidate, profile, brief);
  const claims = verifyClaims(candidate, spec);
  return { ...verification, claims, passed: verification.passed && claims.passed };
}

export function verifyRebuildWithCopySpec(original: string, candidate: string, profile: Profile, spec: CopySpec, brief?: WritingBrief): CopySpecVerification {
  const { baseline, checked, regressions, preservation } = compareCandidates(original, candidate, profile, brief);
  const claims = verifyClaims(candidate, spec);
  const hygiene = inspectHygiene(candidate);
  const finalCheck = finalOutputCheck(candidate);
  const factLint = brief?.factSources?.length ? lintFacts({ sources: brief.factSources, draft: candidate, metadata: brief.factMetadata }) : undefined;
  const requiredFacts = verifyRequiredFacts(candidate, brief);
  return {
    version: '2',
    original: baseline,
    candidate: checked,
    preservationScore: preservation,
    regressions,
    claims,
    ...(factLint ? { factLint } : {}), ...(requiredFacts ? { requiredFacts } : {}),
    passed: checked.passed && !regressions.some(isBlockingFinding) && claims.passed && hygiene.suspiciousCount === 0 && finalCheck.accepted && !factLint?.findings.some((finding) => finding.severity === 'error') && (requiredFacts?.passed ?? true),
  };
}

function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function digestCanonical(value: unknown): string { return digest(canonicalJson(value)); }

function profileIdentity(profile: Profile): { profileId: string; profileRevisionDigest: string } {
  if (profile.version === '3') return { profileId: profile.id, profileRevisionDigest: profile.revisionDigest };
  const legacy = `legacy-v2:${digestCanonical(profile)}`;
  return { profileId: legacy, profileRevisionDigest: legacy };
}

function projectDeterministicVerificationArtifact(
  source: string, candidate: string, profile: Profile,
  verification: Verification | CopySpecVerification, copySpec?: CopySpec, writingBrief?: WritingBrief,
  verificationKind: DeterministicVerificationArtifactV1['verificationKind'] = 'claims' in verification ? 'copy_spec' : 'standard',
): DeterministicVerificationArtifactV1 {
  const identity = profileIdentity(profile);
  const base = {
    version: '1' as const, verificationKind, passed: verification.passed, analysisVersion: verification.candidate.version,
    rulesetVersion: HYV_VERSION, preservationMetricVersion: 'legacy-set-v1' as const, preservationScore: verification.preservationScore,
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
