import type { Analysis, Finding, Profile, WritingBrief } from './contracts.js';
import { analyzeAiEditor } from './ai-editor.js';
import { analyzeEditorial } from './editorial-packs.js';
import { inspectHygiene } from './hygiene.js';
import { analyzeVoiceDna } from './voice-dna.js';

export function analyze(text: string, profile: Profile, brief?: WritingBrief): Analysis {
  const voiceDna = analyzeVoiceDna(text, profile);
  const aiEditor = analyzeAiEditor(text, profile);
  const editorial = brief ? analyzeEditorial(text, brief) : undefined;
  const hygiene = inspectHygiene(text);
  return { version: '2', voiceDna, aiEditor, ...(editorial ? { editorial } : {}), hygiene, passed: voiceDna.passed && aiEditor.passed && (editorial?.passed ?? true) };
}

export function isBlockingFinding(finding: Finding): boolean {
  return finding.engine === 'ai_editor' ? finding.appliedPolicy === 'blocking' : finding.severity === 'red';
}

export function isStrictFinding(finding: Finding): boolean {
  return finding.engine === 'ai_editor' || isBlockingFinding(finding);
}

export function analysisFindings(result: Analysis): Finding[] {
  return [...result.voiceDna.findings, ...result.aiEditor.findings, ...(result.editorial?.findings ?? [])];
}

export function strictFindings(result: Analysis): Finding[] {
  return analysisFindings(result).filter(isStrictFinding);
}

export function deriveEditScope(result: Analysis, strict = false): { eligibleSentenceIds: number[]; blocking: Finding[]; pendingJudgment: Finding[] } {
  const findings = analysisFindings(result);
  const blocking = findings.filter(strict ? isStrictFinding : isBlockingFinding);
  const pendingJudgment = strict ? [] : findings.filter((finding) => finding.appliedPolicy === 'judgment-required');
  return {
    eligibleSentenceIds: [...new Set(blocking.map((finding) => finding.sentence))].sort((left, right) => left - right),
    blocking,
    pendingJudgment,
  };
}

