import type { WritingBrief } from './contracts.js';
import { sentences, words } from './text.js';

export type LogicFindingKind = 'topic_drift' | 'internal_contradiction' | 'unanchored_inference' | 'argument_map_gap';
export type LogicFindingSeverity = 'error' | 'needs_human_review';

export interface LogicFinding {
  kind: LogicFindingKind;
  severity: LogicFindingSeverity;
  sentence: number;
  relatedSentence?: number;
  excerpt: string;
  reason: string;
  suggestion: string;
}

export interface LogicLintReport {
  version: '1';
  passed: boolean;
  summary: { checkedSentences: number; errors: number; needsHumanReview: number };
  findings: LogicFinding[];
  skippedChecks: string[];
  limitations: string[];
}

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'among', 'another', 'because', 'before', 'being', 'between', 'build', 'could', 'every', 'first', 'from', 'have', 'into', 'just', 'like', 'many', 'more', 'most', 'only', 'other', 'over', 'same', 'some', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'very', 'what', 'when', 'which', 'while', 'with', 'would', 'your']);
const ANAPHORA = /\b(?:this|that|these|those|it|they|them|its|their|the result|the change|the work|that choice|this choice|this means)\b/i;
const INFERENCE = /^(?:but|however|therefore|thus|so|instead|because|as a result|that means|this means|the result|in practice)\b/i;
const NEGATION = /\b(?:not|never|no|cannot|can't|won't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't)\b/i;

function stem(word: string): string {
  if (word.length > 6 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function anchors(text: string): Set<string> {
  return new Set(words(text.toLowerCase()).map(stem).filter((word) => word.length > 3 && !STOP_WORDS.has(word)));
}

function overlap(left: Set<string>, right: Set<string>): boolean {
  return [...left].some((item) => right.has(item));
}

function allArgumentAnchors(brief?: WritingBrief): Set<string> {
  if (!brief?.argumentMap) return new Set();
  const map = brief.argumentMap;
  return anchors(`${map.observation} ${map.mechanism} ${map.consequence} ${map.readerValue}`);
}

function contradictionKey(text: string): { key: string; negated: boolean } | undefined {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^((?:[\p{L}\p{N}'-]+\s+){0,4}[\p{L}\p{N}'-]+)\s+(?:is|are|was|were|will|can|should|does|do|did|has|have)\s+(.+)$/u);
  if (!match) return undefined;
  const subject = match[1].split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word)).map(stem).join(' ');
  const predicate = match[2].replace(NEGATION, '').split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word)).map(stem).join(' ');
  return subject && predicate ? { key: `${subject}|${predicate}`, negated: NEGATION.test(normalized) } : undefined;
}

function finding(kind: LogicFindingKind, severity: LogicFindingSeverity, sentence: number, excerpt: string, reason: string, suggestion: string, relatedSentence?: number): LogicFinding {
  return { kind, severity, sentence, ...(relatedSentence ? { relatedSentence } : {}), excerpt, reason, suggestion };
}

export function lintLogic(draft: string, brief?: WritingBrief): LogicLintReport {
  const document = sentences(draft);
  const findings: LogicFinding[] = [];
  const skippedChecks: string[] = [];
  const sentenceAnchors = document.map((sentence) => anchors(sentence.text));
  const frequencies = new Map<string, number>();
  for (const list of sentenceAnchors) for (const anchor of list) frequencies.set(anchor, (frequencies.get(anchor) ?? 0) + 1);
  const dominant = new Set([...frequencies].filter(([, count]) => count >= 2).map(([anchor]) => anchor));
  const briefAnchors = allArgumentAnchors(brief);

  const priorClaims = new Map<string, { sentence: number; negated: boolean }>();
  for (const sentence of document) {
    const claim = contradictionKey(sentence.text);
    if (!claim) continue;
    const previous = priorClaims.get(claim.key);
    if (previous && previous.negated !== claim.negated) {
      findings.push(finding('internal_contradiction', 'error', sentence.index, sentence.text, `This statement reverses the polarity of sentence ${previous.sentence}.`, 'Keep one position, or explain the changed condition explicitly.', previous.sentence));
    } else priorClaims.set(claim.key, { sentence: sentence.index, negated: claim.negated });
  }

  if (document.length < 3) skippedChecks.push('topic_drift_short_post');
  else {
    for (let index = 2; index < document.length - 1; index += 1) {
      const current = document[index]!;
      const currentAnchors = sentenceAnchors[index]!;
      const previousAnchors = sentenceAnchors[index - 1]!;
      const nextAnchors = sentenceAnchors[index + 1]!;
      const connected = overlap(currentAnchors, previousAnchors) || overlap(currentAnchors, nextAnchors) || overlap(currentAnchors, dominant) || overlap(currentAnchors, briefAnchors) || ANAPHORA.test(current.text);
      if (!connected && currentAnchors.size >= 5 && !current.text.trim().endsWith('?')) {
        findings.push(finding('topic_drift', 'error', current.index, current.text, 'This sentence has no detectable topic anchor in the surrounding argument or brief.', 'Connect it to the current subject, or remove it from this post.'));
      }
      if (INFERENCE.test(current.text) && !overlap(currentAnchors, previousAnchors) && !ANAPHORA.test(current.text)) {
        findings.push(finding('unanchored_inference', 'error', current.index, current.text, 'The transition claims an inference or contrast without a detectable subject bridge to the prior sentence.', 'Name the subject that carries across the transition.'));
      }
    }
  }

  if (brief?.argumentMap) {
    const draftAnchors = new Set(sentenceAnchors.flatMap((set) => [...set]));
    const missing = [...briefAnchors].filter((anchor) => !draftAnchors.has(anchor));
    if (briefAnchors.size >= 3 && missing.length === briefAnchors.size) {
      const first = document[0];
      if (first) findings.push(finding('argument_map_gap', 'needs_human_review', first.index, first.text, 'No terms from the brief argument map are visible in the draft.', 'Check that this draft answers the assigned argument.'));
    }
  }

  const errors = findings.filter((item) => item.severity === 'error').length;
  const needsHumanReview = findings.filter((item) => item.severity === 'needs_human_review').length;
  return { version: '1', passed: errors === 0, summary: { checkedSentences: document.length, errors, needsHumanReview }, findings, skippedChecks, limitations: ['English-only lexical coherence check.', 'Does not establish factual truth, rhetorical quality, or publication approval.', 'A pass means no configured deterministic logic failure was found.'] };
}

export function formatLogicLintReport(report: LogicLintReport): string {
  const lines = [`logic lint: ${report.summary.checkedSentences} sentences, ${report.summary.errors} errors, ${report.summary.needsHumanReview} review findings`];
  for (const item of report.findings) lines.push(`${item.severity} ${item.kind} s${item.sentence}: ${item.reason}`);
  if (report.skippedChecks.length) lines.push(`skipped: ${report.skippedChecks.join(', ')}`);
  return lines.join('\n');
}
