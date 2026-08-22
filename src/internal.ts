import { createHash } from 'node:crypto';
import type { Profile } from './contracts.js';
import { canonicalJson } from './canonical-json.js';

export const MAX_JSON_BYTES = 1024 * 1024;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function digestCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function fingerprint(value: unknown): string {
  return sha256(typeof value === 'string' ? value : canonicalJson(value));
}

export function profileIdentity(profile: Profile): { profileId: string; profileRevisionDigest: string } {
  if (profile.version === '3') return { profileId: profile.id, profileRevisionDigest: profile.revisionDigest };
  const legacy = `legacy-v2:${digestCanonical(profile)}`;
  return { profileId: legacy, profileRevisionDigest: legacy };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

export function isText(value: unknown, maximum = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
