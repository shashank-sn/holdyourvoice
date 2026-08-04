import type { Analysis, Finding, Profile, Verification } from './contracts.js';
import { analyzeAiEditor } from './ai-editor.js';
import { analyzeVoiceDna } from './voice-dna.js';
import { words } from './text.js';

export function analyze(text: string, profile: Profile): Analysis {
  const voiceDna = analyzeVoiceDna(text, profile);
  const aiEditor = analyzeAiEditor(text);
  return { version: '2', voiceDna, aiEditor, passed: voiceDna.passed && aiEditor.passed };
}

function formatFindings(findings: Finding[]): string[] {
  return findings.map((finding) => `- Sentence ${finding.sentence} [${finding.engine}/${finding.id}]: ${finding.reason} Repair: ${finding.suggestion}`);
}

export function rewritePrompt(draft: string, profile: Profile): string {
  const result = analyze(draft, profile);
  const allFindings = [...result.voiceDna.findings, ...result.aiEditor.findings];
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
    '',
    '# Tier 3 — AI Editor improvements',
    ...(yellowFindings.length ? formatFindings(yellowFindings) : ['- None.']),
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

export function verify(original: string, candidate: string, profile: Profile): Verification {
  const baseline = analyze(original, profile);
  const checked = analyze(candidate, profile);
  const known = new Set([...baseline.voiceDna.findings, ...baseline.aiEditor.findings].map((finding) => `${finding.engine}:${finding.id}:${finding.sentence}`));
  const regressions = [...checked.voiceDna.findings, ...checked.aiEditor.findings].filter((finding) => !known.has(`${finding.engine}:${finding.id}:${finding.sentence}`));
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
