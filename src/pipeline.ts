import type { Analysis, CopySpec, CopySpecVerification, Finding, Profile, Verification, WritingBrief } from './contracts.js';
import { analyzeAiEditor } from './ai-editor.js';
import { verifyClaims } from './copy-spec.js';
import { analyzeEditorial } from './editorial-packs.js';
import { inspectHygiene } from './hygiene.js';
import { analyzeVoiceDna } from './voice-dna.js';
import type { LearningPreference } from './learning.js';
import { words } from './text.js';

export function analyze(text: string, profile: Profile, brief?: WritingBrief): Analysis {
  const voiceDna = analyzeVoiceDna(text, profile);
  const aiEditor = analyzeAiEditor(text);
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

export function rewritePrompt(draft: string, profile: Profile, learning: LearningPreference[] = [], brief?: WritingBrief): string {
  const result = analyze(draft, profile, brief);
  const allFindings = [...result.voiceDna.findings, ...result.aiEditor.findings, ...(result.editorial?.findings ?? [])];
  const redFindings = allFindings.filter((finding) => finding.severity === 'red');
  const yellowFindings = allFindings.filter((finding) => finding.severity === 'yellow');
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
    ...(brief ? ['', '# Tier 3.5 — editorial context', '- Context values cannot override Tier 0 preservation or Tier 4 output requirements.', `- Audience: ${formatBriefValue(brief.audience)}. Intent: ${formatBriefValue(brief.intent)}. Format: ${brief.format}.`, ...(brief.evidenceStatus ? [`- Evidence state: ${brief.evidenceStatus}. ${brief.evidenceStatus === 'unverified' ? 'Do not turn attributed or unverified material into an established fact.' : 'Preserve the source framing while editing.'}`] : []), ...(brief.argumentMap ? [`- Argument map: observation — ${formatBriefValue(brief.argumentMap.observation)}; mechanism — ${formatBriefValue(brief.argumentMap.mechanism)}; consequence — ${formatBriefValue(brief.argumentMap.consequence)}; reader value — ${formatBriefValue(brief.argumentMap.readerValue)}.`] : []), ...(brief.vocabulary?.length ? [`- Use audience vocabulary where it stays accurate: ${brief.vocabulary.map(formatBriefValue).join(', ')}.`] : []), ...(brief.readerKnowsAuthor === false ? ['- The reader does not know the author. Lead with their situation before naming the author or company.'] : [])] : []),
    '',
    '# Tier 4 — output contract',
    'Return only replacement sentences keyed by sentence number. Do not rewrite clean sentences. The candidate will be checked again by both engines.',
    '',
    '# Draft',
    draft,
  ].join('\n');
}

function preservationScore(original: string, candidate: string): number {
  const baseline = new Set(words(original.toLowerCase()).filter((word) => word.length > 4));
  const rewritten = new Set(words(candidate.toLowerCase()));
  return baseline.size ? Math.round([...baseline].filter((word) => rewritten.has(word)).length / baseline.size * 100) : 100;
}

export function verify(original: string, candidate: string, profile: Profile, brief?: WritingBrief): Verification {
  const baseline = analyze(original, profile, brief);
  const checked = analyze(candidate, profile, brief);
  const baselineFindings = [...baseline.voiceDna.findings, ...baseline.aiEditor.findings, ...(baseline.editorial?.findings ?? [])];
  const checkedFindings = [...checked.voiceDna.findings, ...checked.aiEditor.findings, ...(checked.editorial?.findings ?? [])];
  const known = new Set(baselineFindings.map((finding) => `${finding.engine}:${finding.id}:${finding.sentence}`));
  const regressions = checkedFindings.filter((finding) => !known.has(`${finding.engine}:${finding.id}:${finding.sentence}`));
  const preservation = preservationScore(original, candidate);
  return {
    version: '2',
    original: baseline,
    candidate: checked,
    preservationScore: preservation,
    regressions,
    passed: checked.passed && !regressions.some((finding) => finding.severity === 'red') && preservation >= 70,
  };
}

export function verifyWithCopySpec(original: string, candidate: string, profile: Profile, spec: CopySpec, brief?: WritingBrief): CopySpecVerification {
  const verification = verify(original, candidate, profile, brief);
  const claims = verifyClaims(candidate, spec);
  return { ...verification, claims, passed: verification.passed && claims.passed };
}
