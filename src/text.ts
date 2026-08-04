import type { Sentence } from './contracts.js';

export const words = (text: string): string[] =>
  text.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];

export const mean = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export const deviation = (values: number[], average = mean(values)): number =>
  values.length ? Math.sqrt(mean(values.map((value) => (value - average) ** 2))) : 0;

export function sentences(text: string): Sentence[] {
  const output: Sentence[] = [];
  const abbreviations = new Set(['dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'etc', 'fig', 'no', 'inc', 'ltd', 'co', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);
  let start = 0;

  const add = (end: number): void => {
    const raw = text.slice(start, end);
    const value = raw.trim();
    if (!words(value).length) return;
    const offset = start + raw.indexOf(value);
    output.push({ index: output.length + 1, start: offset, end: offset + value.length, text: value });
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\n') {
      add(index);
      start = index + 1;
      continue;
    }
    if (!'.!?'.includes(character)) continue;
    if (character === '.') {
      const previous = text[index - 1] ?? '';
      const next = text[index + 1] ?? '';
      const previousWord = text.slice(start, index).match(/(\p{L}+)$/u)?.[1]?.toLowerCase();
      if ((/\d/.test(previous) && /\d/.test(next)) || /\p{L}/u.test(next) || (previousWord && abbreviations.has(previousWord))) continue;
    }
    let end = index + 1;
    while (end < text.length && '.!?'.includes(text[end])) end += 1;
    add(end);
    start = end;
    index = end - 1;
  }
  add(text.length);
  return output;
}

export const paragraphs = (text: string): string[] =>
  text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
