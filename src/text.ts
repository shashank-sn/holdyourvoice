import type { Sentence } from './contracts.js';

export const words = (text: string): string[] =>
  text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];

export const mean = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;

export const deviation = (values: number[], average = mean(values)): number =>
  values.length ? Math.sqrt(mean(values.map((value) => (value - average) ** 2))) : 0;

export function sentences(text: string): Sentence[] {
  const matches = text.matchAll(/[^.!?\n]+[.!?]+|[^\n]+$/g);
  const output: Sentence[] = [];

  for (const match of matches) {
    const value = match[0].trim();
    if (!words(value).length) continue;
    const start = (match.index ?? 0) + match[0].indexOf(value);
    output.push({ index: output.length + 1, start, end: start + value.length, text: value });
  }
  return output;
}

export const paragraphs = (text: string): string[] =>
  text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
