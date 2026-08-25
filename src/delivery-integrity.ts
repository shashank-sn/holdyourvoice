import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export type DeliveryDisposition = 'block' | 'review' | 'signal';
export interface DeliveryIntegrityPolicyV1 {
  version: '1';
  block?: Array<'placeholder' | 'local_link'>;
  sourceIds?: string[];
}
export interface DeliveryIntegrityFindingV1 {
  kind: 'placeholder' | 'secret' | 'local_link' | 'citation';
  disposition: DeliveryDisposition;
  excerpt: string;
  reason: string;
  suggestion: string;
}
export interface DeliveryIntegrityReportV1 {
  version: '1';
  passed: boolean;
  findings: DeliveryIntegrityFindingV1[];
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export function parseDeliveryIntegrityPolicy(value: unknown): DeliveryIntegrityPolicyV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Delivery policy must be an object.');
  const policy = value as Record<string, unknown>;
  if (policy.version !== '1' || Object.keys(policy).some((key) => !['version', 'block', 'sourceIds'].includes(key))) throw new Error('Delivery policy is not valid.');
  if (policy.block !== undefined && (!Array.isArray(policy.block) || !policy.block.every((item) => item === 'placeholder' || item === 'local_link'))) throw new Error('Delivery policy block list is not valid.');
  if (policy.sourceIds !== undefined && (!Array.isArray(policy.sourceIds) || !policy.sourceIds.every((item) => typeof item === 'string' && item.length > 0))) throw new Error('Delivery policy source IDs are not valid.');
  return policy as unknown as DeliveryIntegrityPolicyV1;
}

export function inspectDeliveryIntegrity(text: string, policy: DeliveryIntegrityPolicyV1 = { version: '1' }, root = process.cwd()): DeliveryIntegrityReportV1 {
  const findings: DeliveryIntegrityFindingV1[] = [];
  const disposition = (kind: 'placeholder' | 'local_link'): DeliveryDisposition => policy.block?.includes(kind) ? 'block' : 'review';
  for (const match of text.matchAll(/{{\s*[^}]+\s*}}|\[\[\s*[^\]]+\s*\]\]|\b(?:TODO|TBD)\b/g)) {
    findings.push({ kind: 'placeholder', disposition: disposition('placeholder'), excerpt: match[0], reason: 'Unresolved template or editorial placeholder.', suggestion: 'Replace or explicitly remove it before delivery.' });
  }
  for (const match of text.matchAll(/(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/g)) {
    findings.push({ kind: 'secret', disposition: 'review', excerpt: match[0]!.slice(0, 8) + '…', reason: 'Looks like a credential pattern; this is not proof that it is a secret.', suggestion: 'Remove it or verify it is safe to disclose.' });
  }
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)#][^)]*)\)/g)) {
    const target = match[1]!;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const resolved = resolve(root, target);
    const missing = !isInside(root, resolved) || !existsSync(resolved) || !isInside(root, realpathSync(resolved));
    if (missing) findings.push({ kind: 'local_link', disposition: disposition('local_link'), excerpt: target, reason: 'Local Markdown target is missing or resolves outside the approved root.', suggestion: 'Fix the target or use an approved external URL.' });
  }
  for (const match of text.matchAll(/\[@([A-Za-z0-9._:-]+)\]/g)) {
    if (!policy.sourceIds?.includes(match[1]!)) findings.push({ kind: 'citation', disposition: 'signal', excerpt: match[0], reason: 'Citation identifier is not present in the supplied local source manifest.', suggestion: 'Add the ID to sourceIds or review the reference.' });
  }
  return { version: '1', passed: !findings.some((finding) => finding.disposition === 'block'), findings };
}
