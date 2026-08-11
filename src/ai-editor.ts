import type { EngineReport, Finding } from './contracts.js';
import { rules } from './ai-editor-rules.js';
import { sentences } from './text.js';

export type { Rule } from './ai-editor-rules.js';
export { rules } from './ai-editor-rules.js';

export const RULESET_VERSION = '2.9.24-static.2';
const sentenceRules = rules.filter((rule) => rule.scope !== 'line');
const lineRules = rules.filter((rule) => rule.scope === 'line');
const ruleOrder = new Map(rules.map((rule, index) => [rule.id, index]));

export function serializedRules() {
  return rules.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    reason: rule.reason,
    suggestion: rule.suggestion,
    expression: { source: rule.expression.source, flags: rule.expression.flags },
    scope: rule.scope ?? 'sentence',
  }));
}

export function analyzeAiEditor(text: string): EngineReport {
  const findings: Finding[] = [];
  const mapped = sentences(text);
  for (const sentence of mapped) {
    for (const rule of sentenceRules) {
      if (rule.expression.test(sentence.text)) {
        findings.push({
          engine: 'ai_editor',
          id: rule.id,
          severity: rule.severity,
          sentence: sentence.index,
          excerpt: sentence.text,
          reason: rule.reason,
          suggestion: rule.suggestion,
        });
      }
    }
  }

  let lineStart = 0;
  for (const line of text.split('\n')) {
    for (const rule of lineRules) {
      const result = rule.expression.exec(line);
      if (!result) continue;
      const matchStart = lineStart + result.index;
      const sentence = mapped.find((candidate) => candidate.start <= matchStart && matchStart < candidate.end);
      if (!sentence) continue;
      findings.push({
        engine: 'ai_editor',
        id: rule.id,
        severity: rule.severity,
        sentence: sentence.index,
        excerpt: sentence.text,
        reason: rule.reason,
        suggestion: rule.suggestion,
      });
    }
    lineStart += line.length + 1;
  }

  findings.sort((left, right) => left.sentence - right.sentence || (ruleOrder.get(left.id) ?? 0) - (ruleOrder.get(right.id) ?? 0));

  const reds = findings.reduce((count, finding) => count + Number(finding.severity === 'red'), 0);
  const score = Math.max(0, 100 - reds * 18 - (findings.length - reds) * 6);
  return { engine: 'ai_editor', version: RULESET_VERSION, score, passed: reds === 0, findings };
}
