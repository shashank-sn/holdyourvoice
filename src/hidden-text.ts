import { createHash } from 'node:crypto';
import type { HiddenTextAction, HiddenTextApplyReceiptV1, HiddenTextFindingV1, HiddenTextKind, HiddenTextPolicyV1, HiddenTextReportV1 } from './contracts.js';
import { canonicalJson } from './canonical-json.js';

const ACKNOWLEDGEMENT = 'Removes only listed non-semantic controls; all other findings remain review-only.' as const;

export const minimalHiddenTextPolicy: HiddenTextPolicyV1 = {
  version: '1', name: 'minimal-text-control-cleanup', approvedRemovals: ['ascii_control', 'mid_document_bom'], acknowledgement: ACKNOWLEDGEMENT,
};

function hash(value: unknown): string { return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex'); }
function codepoint(value: number): string { return `U+${value.toString(16).toUpperCase().padStart(4, '0')}`; }

export function parseHiddenTextPolicy(value: unknown): HiddenTextPolicyV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Hidden-text policy must be an object.');
  const policy = value as Partial<HiddenTextPolicyV1>;
  const removals = policy.approvedRemovals;
  if (policy.version !== '1' || policy.name !== 'minimal-text-control-cleanup' || policy.acknowledgement !== ACKNOWLEDGEMENT
    || !Array.isArray(removals) || removals.some((item) => item !== 'ascii_control' && item !== 'mid_document_bom')
    || new Set(removals).size !== removals.length) throw new Error('Hidden-text policy is not valid.');
  return { ...policy, approvedRemovals: [...removals] } as HiddenTextPolicyV1;
}

function classified(codepointValue: number, offset: number): { kind: HiddenTextKind; action: HiddenTextAction; reason: string } | undefined {
  if ((codepointValue <= 0x1f && ![0x09, 0x0a, 0x0d].includes(codepointValue)) || codepointValue === 0x7f) return { kind: 'ascii_control', action: 'remove', reason: 'ASCII control is not permitted in user-facing text.' };
  if (codepointValue >= 0x80 && codepointValue <= 0x9f) return { kind: 'c1_control', action: 'review', reason: 'C1 controls can change terminal or renderer behavior.' };
  if (codepointValue === 0xfeff && offset > 0) return { kind: 'mid_document_bom', action: 'remove', reason: 'A byte-order mark is only valid at document start.' };
  if ([0x200b, 0x200c, 0x200d, 0x2060, 0x180e].includes(codepointValue)) return { kind: 'zero_width', action: 'review', reason: 'May be required for script shaping or word boundaries.' };
  if ([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069].includes(codepointValue)) return { kind: 'bidi', action: 'review', reason: 'May be required for bidirectional text.' };
  if (codepointValue >= 0xe0001 && codepointValue <= 0xe007f) return { kind: 'tag', action: 'review', reason: 'Unicode tags can be meaningful in emoji sequences.' };
  if ([0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000].includes(codepointValue)) return { kind: 'unusual_space', action: 'review', reason: 'Spacing may be intentional or language-specific.' };
  return undefined;
}

export function inspectHiddenText(text: string, policy: HiddenTextPolicyV1 = minimalHiddenTextPolicy): HiddenTextReportV1 {
  const parsed = parseHiddenTextPolicy(policy);
  const findings: HiddenTextFindingV1[] = [];
  for (let offset = 0; offset < text.length;) {
    const value = text.codePointAt(offset)!;
    const found = classified(value, offset);
    if (found) {
      const action = found.action === 'remove' && !parsed.approvedRemovals.includes(found.kind as 'ascii_control' | 'mid_document_bom') ? 'review' : found.action;
      findings.push({ kind: found.kind, action, codepoint: codepoint(value), offset, reason: found.reason });
    }
    offset += String.fromCodePoint(value).length;
  }
  return { version: '1', inputHash: hash(text), policyFingerprint: hash(parsed), findings, proposedChanges: findings.filter((item) => item.action === 'remove').map((item) => ({ offset: item.offset, codepoint: item.codepoint, action: 'removed' })) };
}

export function applyHiddenTextPolicy(text: string, policy: HiddenTextPolicyV1 = minimalHiddenTextPolicy): HiddenTextApplyReceiptV1 {
  const report = inspectHiddenText(text, policy);
  const offsets = new Set(report.proposedChanges.map((item) => item.offset));
  let output = '';
  for (let offset = 0; offset < text.length;) {
    const value = text.codePointAt(offset)!;
    const character = String.fromCodePoint(value);
    if (!offsets.has(offset)) output += character;
    offset += character.length;
  }
  const remaining = inspectHiddenText(output, policy).findings;
  const again = applyOnce(output, policy);
  return { ...report, outputHash: hash(output), output, remaining, idempotent: again === output };
}

function applyOnce(text: string, policy: HiddenTextPolicyV1): string {
  const offsets = new Set(inspectHiddenText(text, policy).proposedChanges.map((item) => item.offset));
  let output = '';
  for (let offset = 0; offset < text.length;) {
    const value = text.codePointAt(offset)!; const character = String.fromCodePoint(value);
    if (!offsets.has(offset)) output += character;
    offset += character.length;
  }
  return output;
}
