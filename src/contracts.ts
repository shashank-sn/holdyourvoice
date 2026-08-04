export type Severity = 'red' | 'yellow';
export type Engine = 'voice_dna' | 'ai_editor';

export interface Sentence {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface Finding {
  engine: Engine;
  id: string;
  severity: Severity;
  sentence: number;
  excerpt: string;
  reason: string;
  suggestion: string;
}

export interface EngineReport {
  engine: Engine;
  version: string;
  score: number;
  passed: boolean;
  findings: Finding[];
}

export interface VoiceDnaMetrics {
  sentenceLength: number;
  sentenceVariation: number;
  sentenceStructure: string[];
  rhythm: number;
  paragraphLength: number;
  openingMoves: string[];
  vocabulary: string[];
  lexicalDensity: number;
  pointOfView: 'first_person' | 'second_person' | 'third_person' | 'mixed';
  punctuation: Record<string, number>;
  caseStyle: 'lowercase' | 'standard' | 'mixed';
  questionRate: number;
  transitions: string[];
}

export interface Profile {
  version: string;
  sampleCount: number;
  metrics: VoiceDnaMetrics;
  avoid: string[];
}

export interface Analysis {
  version: string;
  voiceDna: EngineReport;
  aiEditor: EngineReport;
  passed: boolean;
}

export interface Verification {
  version: string;
  original: Analysis;
  candidate: Analysis;
  preservationScore: number;
  regressions: Finding[];
  passed: boolean;
}
