import { createHash } from 'node:crypto';
import type { RuleAllowance } from './contracts.js';
import { SAMPLE_ALLOWANCE_RULE_IDS } from './profile.js';

const RULE_MATCHERS: Record<string, RegExp> = {
  'punct.em-dash': /—/u,
  'punct.en-dash': /–/u,
  'format.curly-quotes': /[“”]/u,
};

/**
 * Returns only non-verbatim evidence for stylistic exceptions shown in two or
 * more author-owned samples. Callers add the result to a signed Profile v3.
 */
export function deriveRuleAllowances(samples: string[]): Record<string, RuleAllowance> {
  const allowances: Record<string, RuleAllowance> = {};
  for (const ruleId of SAMPLE_ALLOWANCE_RULE_IDS) {
    const matched = samples.filter((sample) => RULE_MATCHERS[ruleId].test(sample));
    if (matched.length < 2) continue;
    const evidence = matched.map((sample) => sample.replace(/\s+/gu, ' ').trim()).sort();
    const evidenceDigest = createHash('sha256').update(JSON.stringify({ ruleId, evidence })).digest('hex');
    allowances[ruleId] = { sampleCount: matched.length, evidenceDigest };
  }
  return allowances;
}
