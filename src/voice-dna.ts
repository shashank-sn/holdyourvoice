import type { EngineReport, Finding, FounderFingerprint, Profile, VoiceDnaMetrics } from './contracts.js';
import { deviation, mean, paragraphs, sentences, words } from './text.js';

const STOP_WORDS = new Set(['the', 'and', 'that', 'with', 'this', 'from', 'your', 'have', 'were', 'they', 'will', 'into', 'about', 'what', 'when', 'where']);
const TRANSITIONS = ['but', 'because', 'instead', 'then', 'still', 'so', 'yet', 'therefore'];
const CONTRACTIONS = new Set([
  "aren't", "can't", "couldn't", "didn't", "doesn't", "don't", "hadn't", "hasn't", "haven't", "he'd", "he'll", "he's",
  "i'd", "i'll", "i'm", "i've", "isn't", "it'd", "it'll", "it's", "let's", "mightn't", "mustn't", "shan't", "she'd",
  "she'll", "she's", "shouldn't", "that's", "there's", "they'd", "they'll", "they're", "they've", "wasn't", "we'd",
  "we'll", "we're", "we've", "weren't", "what's", "where's", "who's", "won't", "wouldn't", "you'd", "you'll", "you're", "you've",
]);

function top(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items.filter(Boolean)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].sort((left, right) => right[1] - left[1]).slice(0, limit).map(([item]) => item);
}

function profileMetrics(text: string): VoiceDnaMetrics {
  const draftSentences = sentences(text);
  const draftWords = words(text);
  const lengths = draftSentences.map((sentence) => words(sentence.text).length);
  const starters = draftSentences.map((sentence) => words(sentence.text)[0]?.toLowerCase() ?? '');
  const structures = draftSentences.map((sentence) => words(sentence.text).slice(0, 3).map((word) => word.toLowerCase()).join(' '));
  const lowerWords = draftWords.map((word) => word.toLowerCase());
  const nonStop = lowerWords.filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  const first = lowerWords.filter((word) => ['i', 'we', 'my', 'our', 'us'].includes(word)).length;
  const second = lowerWords.filter((word) => ['you', 'your', 'yours'].includes(word)).length;
  const third = lowerWords.filter((word) => ['he', 'she', 'they', 'their', 'them'].includes(word)).length;
  const pov = first > second && first > third ? 'first_person' : second > first && second > third ? 'second_person' : third > first && third > second ? 'third_person' : 'mixed';
  const paragraphSizes = paragraphs(text).map((paragraph) => sentences(paragraph).length);
  const punctuation = Object.fromEntries(['!', '?', ';', ':', '—'].map((mark) => [mark, (text.match(new RegExp(mark.replace(/[?*+^$.[\]\\(){}|-]/g, '\\$&'), 'g')) ?? []).length]));
  const sentenceLength = mean(lengths);
  const sentenceVariation = deviation(lengths, sentenceLength);
  const rhythm = lengths.length > 1 ? mean(lengths.slice(1).map((length, index) => Math.abs(length - lengths[index]))) : 0;
  const uppercaseStarts = draftSentences.filter((sentence) => /^\p{Lu}/u.test(sentence.text)).length;
  const caseStyle = uppercaseStarts / Math.max(1, draftSentences.length) > 0.8 ? 'standard' : uppercaseStarts === 0 ? 'lowercase' : 'mixed';

  return {
    sentenceLength: Number(sentenceLength.toFixed(2)),
    sentenceVariation: Number(sentenceVariation.toFixed(2)),
    sentenceStructure: top(structures, 8),
    rhythm: Number(rhythm.toFixed(2)),
    paragraphLength: Number(mean(paragraphSizes).toFixed(2)),
    openingMoves: top(starters, 8),
    vocabulary: top(nonStop, 20),
    lexicalDensity: Number((nonStop.length / Math.max(1, lowerWords.length)).toFixed(3)),
    pointOfView: pov,
    punctuation,
    caseStyle,
    questionRate: Number((draftSentences.filter((sentence) => sentence.text.endsWith('?')).length / Math.max(1, draftSentences.length)).toFixed(3)),
    transitions: top(lowerWords.filter((word) => TRANSITIONS.includes(word)), 8),
  };
}

export function measureFounderFingerprint(text: string): FounderFingerprint {
  const draftWords = words(text);
  const wordDenominator = Math.max(1, draftWords.length);
  const contractionCount = draftWords.filter((word) => CONTRACTIONS.has(word.toLowerCase().replaceAll('’', "'"))).length;
  const draftSentences = sentences(text);
  const sentenceDenominator = Math.max(1, draftSentences.length);
  const buckets = { short: 0, medium: 0, long: 0 };
  for (const sentence of draftSentences) {
    const length = words(sentence.text).length;
    if (length <= 8) buckets.short += 1;
    else if (length <= 20) buckets.medium += 1;
    else buckets.long += 1;
  }
  const nonblankLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const bulletCount = nonblankLines.filter((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line)).length;

  return {
    contractionRate: contractionCount / wordDenominator,
    sentenceLengthDistribution: {
      short: buckets.short / sentenceDenominator,
      medium: buckets.medium / sentenceDenominator,
      long: buckets.long / sentenceDenominator,
    },
    bulletRate: bulletCount / Math.max(1, nonblankLines.length),
    // En dashes per word. The denominator is clamped to one so punctuation-only input remains defined.
    enDashRate: (text.match(/–/g) ?? []).length / wordDenominator,
  };
}

export function buildProfile(samples: string[], avoid: string[] = []): Profile {
  if (samples.length < 2) throw new Error('Provide at least two local writing samples.');
  if (samples.some((sample) => !words(sample).length)) throw new Error('Every local writing sample must contain writing.');
  return { version: '2', sampleCount: samples.length, metrics: profileMetrics(samples.join('\n\n')), avoid };
}

function finding(id: string, severity: Finding['severity'], sentence: number, excerpt: string, reason: string, suggestion: string): Finding {
  return { engine: 'voice_dna', id, severity, sentence, excerpt, reason, suggestion };
}

export function analyzeVoiceDna(text: string, profile: Profile): EngineReport {
  const metrics = profileMetrics(text);
  const findings: Finding[] = [];
  const tolerance = Math.max(8, profile.metrics.sentenceVariation * 2.2);

  for (const sentence of sentences(text)) {
    const count = words(sentence.text).length;
    if (Math.abs(count - profile.metrics.sentenceLength) > tolerance) findings.push(finding('dna.sentence-length', 'yellow', sentence.index, sentence.text, `Sentence length (${count}) is outside the profile band around ${profile.metrics.sentenceLength}.`, 'Restore the writer’s usual sentence length where it improves clarity.'));
    for (const banned of profile.avoid) if (sentence.text.toLowerCase().includes(banned.toLowerCase())) findings.push(finding('dna.avoid-list', 'red', sentence.index, sentence.text, `Uses profile avoid-list phrase: ${banned}.`, 'Replace it with the writer’s natural language.'));
  }
  if (Math.abs(metrics.questionRate - profile.metrics.questionRate) > 0.25) findings.push(finding('dna.question-rate', 'yellow', 1, text.slice(0, 160), 'Question frequency differs materially from the profile.', 'Match the writer’s usual use of questions.'));
  if (metrics.caseStyle !== profile.metrics.caseStyle) findings.push(finding('dna.case-style', 'yellow', 1, text.slice(0, 160), `Draft uses ${metrics.caseStyle} casing; profile uses ${profile.metrics.caseStyle}.`, 'Use the profile’s normal casing.'));
  if (metrics.pointOfView !== profile.metrics.pointOfView && profile.metrics.pointOfView !== 'mixed') findings.push(finding('dna.point-of-view', 'yellow', 1, text.slice(0, 160), `Draft point of view is ${metrics.pointOfView}; profile is ${profile.metrics.pointOfView}.`, 'Restore the writer’s normal narrative distance.'));

  if (profile.version === '3') {
    const measured = measureFounderFingerprint(text);
    const fingerprintChecks = [
      ['contraction-rate', measured.contractionRate, profile.fingerprint.contractionRate, profile.tolerances.contractionRate],
      ['sentence-length-distribution', Math.max(
        Math.abs(measured.sentenceLengthDistribution.short - profile.fingerprint.sentenceLengthDistribution.short),
        Math.abs(measured.sentenceLengthDistribution.medium - profile.fingerprint.sentenceLengthDistribution.medium),
        Math.abs(measured.sentenceLengthDistribution.long - profile.fingerprint.sentenceLengthDistribution.long),
      ), 0, profile.tolerances.sentenceLengthDistribution],
      ['bullet-rate', measured.bulletRate, profile.fingerprint.bulletRate, profile.tolerances.bulletRate],
      ['en-dash-rate', measured.enDashRate, profile.fingerprint.enDashRate, profile.tolerances.enDashRate],
    ] as const;
    for (const [id, actual, target, metricTolerance] of fingerprintChecks) {
      const drift = id === 'sentence-length-distribution' ? actual : Math.abs(actual - target);
      if (drift > metricTolerance.absolute) {
        const calibration = metricTolerance.calibrated ? 'calibrated' : 'uncalibrated';
        findings.push(finding(`dna.fingerprint.${id}`, 'yellow', 1, text.slice(0, 160), `Voice fingerprint drift (${Number(drift.toFixed(3))}) exceeds the ${calibration} tolerance (${metricTolerance.absolute}).`, 'Review this metric as a non-blocking voice cue.'));
      }
    }
  }

  const red = findings.filter((item) => item.severity === 'red').length;
  const yellow = findings.length - red;
  const score = Math.max(0, 100 - red * 25 - yellow * 7);
  return { engine: 'voice_dna', version: profile.version, score, passed: red === 0, findings };
}
