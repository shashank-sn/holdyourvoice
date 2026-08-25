import { createHash } from 'node:crypto';
import { sentences } from './text.js';

export type SampleIngestSource = 'gmail-sent-mbox' | 'telegram-desktop-json';
export type RedactionCategory = 'email' | 'phone' | 'card' | 'ip' | 'url';

export interface SampleIngestReceiptV1 {
  version: '1';
  source: SampleIngestSource;
  sourceDigest: string;
  messagesSeen: number;
  messagesAccepted: number;
  samplesAccepted: number;
  droppedSentences: number;
  redactions: Record<RedactionCategory, number>;
  presidio: 'NOT_CONFIGURED';
}

export interface SampleIngestResult {
  samples: string[];
  receipt: SampleIngestReceiptV1;
}

interface Message { owner: string; text: string; }

const EMPTY_REDACTIONS: Record<RedactionCategory, number> = { email: 0, phone: 0, card: 0, ip: 0, url: 0 };
const REDACTORS: Array<[RedactionCategory, RegExp]> = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['phone', /(?<!\w)(?:\+?\d[\d .()/-]{7,}\d)(?!\w)/g],
  ['card', /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g],
  ['ip', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  ['url', /\bhttps?:\/\/[^\s<>()]+/gi],
];

function digest(text: string): string { return createHash('sha256').update(text).digest('hex'); }
function textFromTelegram(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => typeof part === 'string' ? part : part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '').join('');
}
function decodeMboxBody(message: string): string {
  const body = message.replace(/^[\s\S]*?\r?\n\r?\n/, '');
  return body.replace(/^>.*$/gm, '').replace(/=\r?\n/g, '').replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))).trim();
}
function mboxMessages(source: string): Message[] {
  return source.split(/^From .+$/m).slice(1).flatMap((part) => {
    const from = part.match(/^From:\s*(.+)$/mi)?.[1]?.trim() ?? '';
    const text = decodeMboxBody(part);
    return from && text ? [{ owner: from, text }] : [];
  });
}
function telegramMessages(source: string): Message[] {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('Telegram Desktop export is not valid JSON.'); }
  const values = parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown }).messages) ? (parsed as { messages: unknown[] }).messages : [];
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const message = value as { type?: unknown; from?: unknown; from_id?: unknown; text?: unknown };
    const owner = typeof message.from_id === 'string' ? message.from_id : typeof message.from === 'string' ? message.from : '';
    const text = textFromTelegram(message.text);
    return message.type === 'message' && owner && text ? [{ owner, text }] : [];
  });
}
function containsBlockedWord(text: string, blockedWords: string[]): boolean {
  const lower = text.toLocaleLowerCase();
  return blockedWords.some((word) => lower.includes(word.toLocaleLowerCase()));
}
function redact(text: string, counts: Record<RedactionCategory, number>): string {
  let output = text;
  for (const [category, expression] of REDACTORS) output = output.replace(expression, (value) => {
    counts[category] += 1;
    return '[REDACTED:' + category.toUpperCase() + ']';
  });
  return output;
}

function ingest(source: SampleIngestSource, raw: string, messages: Message[], owner: string, blockedWords: string[] = []): SampleIngestResult {
  if (!owner.trim()) throw new Error('Sample ingest requires an explicit owner identifier.');
  if (blockedWords.some((word) => !word.trim())) throw new Error('Blocked words must be non-empty.');
  const redactions = { ...EMPTY_REDACTIONS };
  let droppedSentences = 0;
  const samples: string[] = [];
  const accepted = messages.filter((message) => message.owner.toLocaleLowerCase() === owner.toLocaleLowerCase());
  for (const message of accepted) {
    const safe = sentences(message.text).flatMap((sentence) => {
      if (containsBlockedWord(sentence.text, blockedWords)) { droppedSentences += 1; return []; }
      return [redact(sentence.text, redactions)];
    }).join(' ').replace(/\s+/g, ' ').trim();
    if (safe) samples.push(safe);
  }
  return {
    samples,
    receipt: {
      version: '1', source, sourceDigest: digest(raw), messagesSeen: messages.length, messagesAccepted: accepted.length, samplesAccepted: samples.length,
      droppedSentences, redactions, presidio: 'NOT_CONFIGURED',
    },
  };
}

export function ingestGmailSentMbox(source: string, owner: string, blockedWords: string[] = []): SampleIngestResult {
  return ingest('gmail-sent-mbox', source, mboxMessages(source), owner, blockedWords);
}

export function ingestTelegramDesktopJson(source: string, owner: string, blockedWords: string[] = []): SampleIngestResult {
  return ingest('telegram-desktop-json', source, telegramMessages(source), owner, blockedWords);
}
