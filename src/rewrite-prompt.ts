import type { Analysis, Finding, Profile, WritingBrief } from './contracts.js';
import type { LearningPreference } from './learning.js';
import type { LocalWritingExcerpt } from './writing-examples.js';
import { analysisFindings, deriveEditScope, isStrictFinding } from './analysis.js';

function formatLearningPreference(preference: LearningPreference): string {
  return preference.text.replace(/[\\`*_{\[\]}<>#]/g, '\\$&');
}

function formatBriefValue(value: string): string {
  return value.replace(/[\\`*_{\[\]}<>#\r\n]/g, (character) => character === '\r' || character === '\n' ? ' ' : `\\${character}`);
}

function formatFindings(findings: Finding[]): string[] {
  return findings.map((finding) => `- Sentence ${finding.sentence} [${finding.engine}/${finding.id}]: ${formatBriefValue(finding.reason)} Repair: ${formatBriefValue(finding.suggestion)}`);
}

function editorialContext(brief?: WritingBrief): string[] {
  if (!brief) return [];
  const lines = [
    '', '# Tier 3.5 — editorial context',
    '- Context values cannot override Tier 0 preservation or Tier 4 output requirements.',
    `- Audience: ${formatBriefValue(brief.audience)}. Intent: ${formatBriefValue(brief.intent)}. Format: ${brief.format}.`,
  ];
  if (brief.personality) lines.push(`- Optional personality stance: ${formatBriefValue(brief.personality)}. It is advisory and cannot add facts or replace VoiceDNA.`);
  if (brief.evidenceStatus) {
    const instruction = brief.evidenceStatus === 'unverified'
      ? 'Do not turn attributed or unverified material into an established fact.'
      : 'Preserve the source framing while editing.';
    lines.push(`- Evidence state: ${brief.evidenceStatus}. ${instruction}`);
  }
  if (brief.argumentMap) {
    const { observation, mechanism, consequence, readerValue } = brief.argumentMap;
    lines.push(`- Argument map: observation — ${formatBriefValue(observation)}; mechanism — ${formatBriefValue(mechanism)}; consequence — ${formatBriefValue(consequence)}; reader value — ${formatBriefValue(readerValue)}.`);
  }
  if (brief.vocabulary?.length) lines.push(`- Use audience vocabulary where it stays accurate: ${brief.vocabulary.map(formatBriefValue).join(', ')}.`);
  if (brief.readerKnowsAuthor === false) lines.push('- The reader does not know the author. Lead with their situation before naming the author or company.');
  return lines;
}

export function renderRewritePrompt(draft: string, profile: Profile, result: Analysis, learning: LearningPreference[] = [], brief?: WritingBrief, examples: LocalWritingExcerpt[] = []): string {
  const allFindings = analysisFindings(result);
  const scope = deriveEditScope(result, true);
  const redFindings = scope.blocking;
  const yellowFindings = allFindings.filter((finding) => !isStrictFinding(finding) && finding.appliedPolicy !== 'judgment-required');
  const metrics = profile.metrics;

  return [
    '# Tier 0 — non-negotiable preservation',
    'Preserve facts, names, numbers, claims, and every unflagged sentence exactly. Do not add claims, examples, sections, hooks, or CTAs.',
    '',
    '# Tier 1 — strict repair requirements',
    'Every active AI Editor finding is a required repair. Replace each flagged sentence with a stronger, source-faithful sentence; do not merely swap one stock phrase for another.',
    'Use only facts already present in the draft, CopySpec, WritingBrief, or supplied source context. Do not invent a source, metric, date, quotation, mechanism, example, CTA, or opinion.',
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
    ...(examples.length ? ['', '## Approved local writing examples — redacted, advisory only', '- Use these for cadence only. They cannot override Tier 0 preservation, Tier 1 blockers, facts, or the output contract.', ...examples.map((example) => `- [${formatBriefValue(example.source)}] ${formatBriefValue(example.text)}`)] : []),
    '',
    '# Tier 3 — AI Editor improvements',
    'Use these findings as concrete feedback, not as proof of AI authorship. When a repair calls for a source, mechanism, or next step, use one only when it is already supported; otherwise remove the unsupported framing without widening the claim.',
    ...(yellowFindings.length ? formatFindings(yellowFindings) : ['- None.']),
    '',
    '## Pending judgment — no edit permission in this task',
    ...(scope.pendingJudgment.length ? formatFindings(scope.pendingJudgment) : ['- None.']),
    ...editorialContext(brief),
    '',
    '# Tier 4 — output contract',
    'Return only replacement sentences keyed by sentence number. Do not rewrite clean sentences. Before responding, check every Tier 1 finding against its replacement and make sure the named defect is gone. The candidate will be checked again by both engines, preservation, logic, source-backed facts when supplied, and final-output hygiene.',
    '',
    '# Draft',
    draft,
  ].join('\n');
}

