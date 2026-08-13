import type { FinalOutputCheck, HygieneChange, HygieneHit, HygieneKind, HygieneReport, HygieneSourceFinding } from './contracts.js';

type CharacterPolicy = { kind: HygieneKind; label: string; fix: 'remove' | 'none' };

const CHARACTER_POLICIES = new Map<number, CharacterPolicy>([
  [0x180e, { kind: 'zero_width', label: 'Mongolian vowel separator', fix: 'none' }],
  [0x200b, { kind: 'zero_width', label: 'Zero width space', fix: 'none' }],
  [0x200c, { kind: 'zero_width', label: 'Zero width non-joiner', fix: 'none' }],
  [0x200d, { kind: 'zero_width', label: 'Zero width joiner', fix: 'none' }],
  [0x2060, { kind: 'zero_width', label: 'Word joiner', fix: 'none' }],
  [0xfeff, { kind: 'zero_width', label: 'Byte order mark / zero width no-break space', fix: 'none' }],
]);

for (const [codepoint, label] of [
  [0x061c, 'Arabic letter mark'], [0x200e, 'Left-to-right mark'], [0x200f, 'Right-to-left mark'],
  [0x202a, 'Left-to-right embedding'], [0x202b, 'Right-to-left embedding'], [0x202c, 'Pop directional formatting'],
  [0x202d, 'Left-to-right override'], [0x202e, 'Right-to-left override'], [0x2066, 'Left-to-right isolate'],
  [0x2067, 'Right-to-left isolate'], [0x2068, 'First strong isolate'], [0x2069, 'Pop directional isolate'],
] as const) CHARACTER_POLICIES.set(codepoint, { kind: 'bidi', label, fix: 'none' });

for (const [codepoint, label] of [
  [0x00a0, 'No-break space'], [0x1680, 'Ogham space mark'], [0x2000, 'En quad'], [0x2001, 'Em quad'],
  [0x2002, 'En space'], [0x2003, 'Em space'], [0x2004, 'Three-per-em space'], [0x2005, 'Four-per-em space'],
  [0x2006, 'Six-per-em space'], [0x2007, 'Figure space'], [0x2008, 'Punctuation space'], [0x2009, 'Thin space'],
  [0x200a, 'Hair space'], [0x202f, 'Narrow no-break space'], [0x205f, 'Medium mathematical space'], [0x3000, 'Ideographic space'],
] as const) CHARACTER_POLICIES.set(codepoint, { kind: 'unusual_space', label, fix: 'none' });

function formattedCodepoint(codepoint: number): string {
  return `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function classification(codepoint: number): CharacterPolicy | undefined {
  return CHARACTER_POLICIES.get(codepoint) ?? (codepoint >= 0xe0001 && codepoint <= 0xe007f
    ? { kind: 'tag', label: 'Unicode tag character', fix: 'none' }
    : undefined);
}

function policyAt(codepoint: number, offset: number): CharacterPolicy | undefined {
  const policy = classification(codepoint);
  return codepoint === 0xfeff && offset === 0 && policy ? { ...policy, fix: 'remove' } : policy;
}

function scanHygiene(text: string, clean: boolean): { report: HygieneReport; cleaned: string; changes: HygieneChange[] } {
  const grouped = new Map<string, CharacterPolicy & { codepoint: number; offsets: number[] }>();
  const cleanedParts: string[] = [];
  const changes: HygieneChange[] = [];
  let unchangedStart = 0;
  for (let offset = 0; offset < text.length;) {
    const codepoint = text.codePointAt(offset) as number;
    const character = String.fromCodePoint(codepoint);
    const found = policyAt(codepoint, offset);
    if (found) {
      const key = `${codepoint}:${found.fix}`;
      const hit = grouped.get(key) ?? { ...found, codepoint, offsets: [] };
      hit.offsets.push(offset);
      grouped.set(key, hit);
      if (clean && found.fix !== 'none') {
        cleanedParts.push(text.slice(unchangedStart, offset));
        changes.push({ offset, codepoint: formattedCodepoint(codepoint), action: 'removed' });
        unchangedStart = offset + character.length;
      }
    }
    offset += character.length;
  }

  const hits: HygieneHit[] = [...grouped.values()].sort((left, right) => left.codepoint - right.codepoint || left.offsets[0]! - right.offsets[0]!).map((hit) => {
    const { codepoint } = hit;
    const base = { codepoint: formattedCodepoint(codepoint), label: hit.label, kind: hit.kind, count: hit.offsets.length, offsets: hit.offsets };
    return { ...base, fix: hit.fix };
  });
  const report: HygieneReport = {
    version: '1',
    length: text.length,
    suspiciousCount: hits.reduce((total, hit) => total + hit.count, 0),
    fixableCount: hits.filter((hit) => hit.fix !== 'none').reduce((total, hit) => total + hit.count, 0),
    hits,
  };
  if (cleanedParts.length) cleanedParts.push(text.slice(unchangedStart));
  return { report, cleaned: cleanedParts.length ? cleanedParts.join('') : text, changes };
}

export function inspectHygiene(text: string): HygieneReport {
  return scanHygiene(text, false).report;
}

export function hygieneSourceFindings(text: string): HygieneSourceFinding[] {
  return inspectHygiene(text).hits.flatMap((hit) => hit.offsets.map((start) => {
    const character = String.fromCodePoint(text.codePointAt(start) as number);
    return { kind: 'hygiene' as const, start, end: start + character.length, codepoint: hit.codepoint, eligible: hit.fix === 'remove' };
  }));
}

export function cleanHygiene(text: string): { report: HygieneReport; cleaned: string; changed: boolean; changes: HygieneChange[] } {
  const result = scanHygiene(text, true);
  return { ...result, changed: result.changes.length > 0 };
}

export function finalOutputCheck(text: string): FinalOutputCheck {
  const cleaned = cleanHygiene(text);
  const remaining = inspectHygiene(cleaned.cleaned);
  const base = { version: '1' as const, changed: cleaned.changed, changes: cleaned.changes, input: cleaned.report, remaining };
  return remaining.suspiciousCount === 0 ? { ...base, accepted: true, output: cleaned.cleaned } : { ...base, accepted: false };
}
