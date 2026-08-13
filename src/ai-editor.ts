import type { EngineReport, Finding, Profile, RulePolicyState } from './contracts.js';
import { rules } from './ai-editor-rules.js';
import { sentences } from './text.js';

export type { Rule } from './ai-editor-rules.js';
export { rules } from './ai-editor-rules.js';

export const RULESET_VERSION = '3.2.0-reconciled.1';
const sentenceRules = rules.filter((rule) => rule.scope !== 'line');
const lineRules = rules.filter((rule) => rule.scope === 'line');
const ruleOrder = new Map(rules.map((rule, index) => [rule.id, index]));
const ruleIds = new Set(rules.map((rule) => rule.id));
const policyStates = new Set<RulePolicyState>(['blocking', 'advisory', 'judgment-required', 'disabled']);
const suppressedDuplicateIds = new Set(['hedge.worth-noting', 'struct.in-other-words']);
const reconciledPolicies: Record<string, RulePolicyState> = {
  'struct.not-x-y': 'advisory',
  'struct.this-isnt-x-this-is-y': 'advisory',
  'struct.same-better': 'disabled',
  'struct.moment-becomes': 'disabled',
  'hedge.i-think': 'disabled',
  'ai.question-hook': 'advisory',
};

function defaultPolicy(id: string, severity: 'red' | 'yellow'): RulePolicyState {
  const reconciled = reconciledPolicies[id];
  if (reconciled) return reconciled;
  if (severity === 'red' && (id.startsWith('ai.') || id.startsWith('ogilvy.'))) return 'judgment-required';
  return severity === 'red' ? 'blocking' : 'advisory';
}

function policiesFor(profile?: Profile): Map<string, RulePolicyState> {
  if (profile?.version === '3') {
    for (const [id, state] of Object.entries(profile.rulePolicy)) {
      if (!ruleIds.has(id)) throw new Error(`Profile rulePolicy contains unknown rule ID: ${id}`);
      if (!policyStates.has(state)) throw new Error(`Profile rulePolicy contains invalid state for rule ID: ${id}`);
    }
  }
  return new Map(rules.map((rule) => [rule.id, profile?.version === '3' && profile.rulePolicy[rule.id]
    ? profile.rulePolicy[rule.id]
    : defaultPolicy(rule.id, rule.severity)]));
}

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

export function analyzeAiEditor(text: string, profile?: Profile): EngineReport {
  const matched: Finding[] = [];
  const mapped = sentences(text);
  for (const sentence of mapped) {
    for (const rule of sentenceRules) {
      if (rule.expression.test(sentence.text)) {
        matched.push({
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
      matched.push({
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

  matched.sort((left, right) => left.sentence - right.sentence || (ruleOrder.get(left.id) ?? 0) - (ruleOrder.get(right.id) ?? 0));

  const policies = policiesFor(profile);
  const findings = matched.flatMap((finding): Finding[] => {
    if (suppressedDuplicateIds.has(finding.id)) return [];
    if (finding.id === 'ai.question-hook' && finding.sentence !== 1) return [];
    const appliedPolicy = policies.get(finding.id);
    if (!appliedPolicy || appliedPolicy === 'disabled') return [];
    return [{ ...finding, appliedPolicy, severity: appliedPolicy === 'blocking' ? 'red' : 'yellow' }];
  });

  const blocking = findings.reduce((count, finding) => count + Number(finding.appliedPolicy === 'blocking'), 0);
  const score = Math.max(0, 100 - blocking * 18 - (findings.length - blocking) * 6);
  return { engine: 'ai_editor', version: RULESET_VERSION, score, passed: blocking === 0, findings };
}
