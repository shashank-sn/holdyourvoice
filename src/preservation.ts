import { words } from './text.js';

export const LEGACY_SET_PRESERVATION_VERSION = 'legacy-set-v1' as const;
export const ORDERED_TOKEN_PRESERVATION_VERSION = 'ordered-token-sequence-v1' as const;

export interface LegacySetPreservation {
  version: typeof LEGACY_SET_PRESERVATION_VERSION;
  score: number;
}

export interface OrderedTokenPreservation {
  version: typeof ORDERED_TOKEN_PRESERVATION_VERSION;
  wordSurvival: number;
  lengthRatio: number;
}

function donorTokens(text: string): string[] {
  return (text.match(/[A-Za-z0-9$%#][A-Za-z0-9$%#'’.,-]*/g) ?? [])
    .map((token) => token.replace(/^[.,'’]+|[.,'’]+$/g, '').toLowerCase());
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function tokenPositions(tokens: string[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  tokens.forEach((token, index) => {
    const indexes = positions.get(token) ?? [];
    indexes.push(index);
    positions.set(token, indexes);
  });
  return positions;
}

function longestMatch(left: string[], rightPositions: Map<string, number[]>, leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): [number, number, number] {
  let best: [number, number, number] = [leftStart, rightStart, 0];
  let previous = new Map<number, number>();
  for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
    const current = new Map<number, number>();
    const indexes = rightPositions.get(left[leftIndex]!) ?? [];
    for (let position = lowerBound(indexes, rightStart); position < indexes.length && indexes[position]! < rightEnd; position += 1) {
      const rightIndex = indexes[position]!;
      const size = (previous.get(rightIndex - 1) ?? 0) + 1;
      current.set(rightIndex, size);
      const start: [number, number, number] = [leftIndex - size + 1, rightIndex - size + 1, size];
      if (size > best[2] || (size === best[2] && (start[0] < best[0] || (start[0] === best[0] && start[1] < best[1])))) best = start;
    }
    previous = current;
  }
  return best;
}

function matchedOrderedTokens(left: string[], right: string[]): number {
  const rightPositions = tokenPositions(right);
  const pending: Array<[number, number, number, number]> = [[0, left.length, 0, right.length]];
  let matched = 0;
  while (pending.length) {
    const [leftStart, leftEnd, rightStart, rightEnd] = pending.pop()!;
    const [matchLeft, matchRight, size] = longestMatch(left, rightPositions, leftStart, leftEnd, rightStart, rightEnd);
    if (!size) continue;
    matched += size;
    if (leftStart < matchLeft && rightStart < matchRight) pending.push([leftStart, matchLeft, rightStart, matchRight]);
    if (matchLeft + size < leftEnd && matchRight + size < rightEnd) pending.push([matchLeft + size, leftEnd, matchRight + size, rightEnd]);
  }
  return matched;
}

function roundThree(value: number): number {
  const scaled = value * 1000;
  const lower = Math.floor(scaled);
  const fraction = scaled - lower;
  if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2) return (lower + (lower % 2)) / 1000;
  return Math.round(scaled) / 1000;
}

export function legacySetPreservation(original: string, candidate: string): LegacySetPreservation {
  const baseline = new Set(words(original.toLowerCase()).filter((word) => word.length > 4));
  const rewritten = new Set(words(candidate.toLowerCase()));
  const score = baseline.size ? Math.round([...baseline].filter((word) => rewritten.has(word)).length / baseline.size * 100) : 100;
  return { version: LEGACY_SET_PRESERVATION_VERSION, score };
}

export function orderedTokenPreservation(original: string, candidate: string): OrderedTokenPreservation {
  const baseline = donorTokens(original);
  const rewritten = donorTokens(candidate);
  return {
    version: ORDERED_TOKEN_PRESERVATION_VERSION,
    wordSurvival: roundThree(matchedOrderedTokens(baseline, rewritten) / Math.max(baseline.length, 1)),
    lengthRatio: roundThree(rewritten.length / Math.max(baseline.length, 1)),
  };
}

export function comparePreservation(original: string, candidate: string): { legacySet: LegacySetPreservation; orderedToken: OrderedTokenPreservation } {
  return { legacySet: legacySetPreservation(original, candidate), orderedToken: orderedTokenPreservation(original, candidate) };
}
