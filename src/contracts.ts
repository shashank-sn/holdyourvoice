export type Severity = 'red' | 'yellow';
export type Engine = 'voice_dna' | 'ai_editor';
export interface Sentence { index: number; start: number; end: number; text: string; }
export interface Finding { engine: Engine; id: string; severity: Severity; sentence: number; excerpt: string; reason: string; suggestion: string; }
export interface EngineReport { engine: Engine; version: string; score: number; passed: boolean; findings: Finding[]; }
export interface Profile { version: string; sampleCount: number; averageSentenceWords: number; sentenceDeviation: number; commonOpeners: string[]; preferredWords: string[]; avoid: string[]; }
export interface Analysis { version: string; voiceDna: EngineReport; aiEditor: EngineReport; passed: boolean; }
export interface Verification extends Analysis { preservationScore: number; regressions: Finding[]; }
