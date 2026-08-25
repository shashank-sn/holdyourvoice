import { createHash, createPublicKey, verify } from 'node:crypto';
import type { Profile, ProfileV3, RulePolicyState } from './contracts.js';
import { profileFingerprint } from './learning.js';

export interface TeamProfileMemberV1 { role: 'brand' | 'author'; sourceType: 'individual-writing' | 'approved-brand-guide'; profileFingerprint: string; profileRevisionDigest?: string; consent: { approved: true; basis: string; expiresAt: string }; }
export interface TeamProfileAuthorizationV1 { issuer: string; publicKeyPem: string; signatureBase64: string; }
export interface TeamProfileBundleV1 { version: '1'; id: string; createdAt: string; retention: string; members: TeamProfileMemberV1[]; authorization: TeamProfileAuthorizationV1; digest: string; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`; } return JSON.stringify(value); }
function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
export function createTeamProfileBundle(input: Omit<TeamProfileBundleV1, 'version' | 'digest'>): TeamProfileBundleV1 {
  const value = { version: '1' as const, ...input }; return { ...value, digest: digest(value) };
}
export function parseTeamProfileBundle(value: unknown, now = new Date()): TeamProfileBundleV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Team profile bundle is invalid.');
  const bundle = value as TeamProfileBundleV1;
  if (bundle.version !== '1' || typeof bundle.id !== 'string' || !validDate(bundle.createdAt) || typeof bundle.retention !== 'string' || !Array.isArray(bundle.members) || !bundle.members.length || !bundle.authorization || typeof bundle.authorization.issuer !== 'string' || typeof bundle.authorization.publicKeyPem !== 'string' || typeof bundle.authorization.signatureBase64 !== 'string' || !/^[a-f0-9]{64}$/.test(bundle.digest ?? '')) throw new Error('Team profile bundle is invalid.');
  const { digest: provided, ...unsigned } = bundle;
  if (digest(unsigned) !== provided) throw new Error('Team profile bundle digest does not match.');
  const signed = canonical({ version: bundle.version, id: bundle.id, createdAt: bundle.createdAt, retention: bundle.retention, members: bundle.members });
  try { if (!verify(null, Buffer.from(signed), createPublicKey(bundle.authorization.publicKeyPem), Buffer.from(bundle.authorization.signatureBase64, 'base64'))) throw new Error('invalid'); } catch { throw new Error('Team profile bundle authorization is invalid.'); }
  if (!bundle.members.some((member) => member.role === 'author') || !bundle.members.every((member) => (member.role === 'author' || member.role === 'brand') && ['individual-writing', 'approved-brand-guide'].includes(member.sourceType) && /^[a-f0-9]{64}$/.test(member.profileFingerprint) && member.consent?.approved === true && typeof member.consent.basis === 'string' && validDate(member.consent.expiresAt) && Date.parse(member.consent.expiresAt) > now.getTime())) throw new Error('Team profile bundle consent is invalid or expired.');
  return bundle;
}
export function composeTeamProfile(author: Profile, brands: ProfileV3[], bundle: TeamProfileBundleV1, now = new Date()): Profile {
  const parsed = parseTeamProfileBundle(bundle, now);
  if (!parsed.members.some((member) => member.role === 'author' && member.profileFingerprint === profileFingerprint(author))) throw new Error('Team profile bundle does not authorize this author profile.');
  if (author.version !== '3') return author;
  const policy: Record<string, RulePolicyState> = { ...author.rulePolicy };
  for (const brand of brands) {
    if (!parsed.members.some((member) => member.role === 'brand' && member.profileFingerprint === profileFingerprint(brand))) throw new Error('Team profile bundle does not authorize this brand profile.');
    for (const [id, state] of Object.entries(brand.rulePolicy)) if (!policy[id] || state === 'blocking') policy[id] = state;
  }
  return { ...author, avoid: [...new Set([...author.avoid, ...brands.flatMap((brand) => brand.avoid)])], rulePolicy: policy };
}
