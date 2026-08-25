/**
 * Development/CI-only deterministic tell injection. HYV never calls a model
 * or invokes this helper while analyzing user prose.
 */
export type AiShadowTell = 'metric-theater' | 'jargon-stack' | 'forced-triplet' | 'clipped-run';

export interface GeneratedAiShadowFixture {
  id: AiShadowTell;
  text: string;
  rule: string;
}

function injectTell(seed: string, tell: AiShadowTell): GeneratedAiShadowFixture {
  switch (tell) {
    case 'metric-theater': return { id: tell, text: `At 3:47 AM, ${seed} promised a 23.6x ROI.`, rule: 'ai.metric-theater' };
    case 'jargon-stack': return { id: tell, text: `The scalable ${seed} needs alignment, leverage, and a holistic framework.`, rule: 'ai.jargon-stack' };
    case 'forced-triplet': return { id: tell, text: `The ${seed} promises speed, scale, and alignment.`, rule: 'ai.forced-triplet' };
    case 'clipped-run': return { id: tell, text: `No demos. No decks. No distractions. The ${seed} checked the logs.`, rule: 'ai.clipped-fragment-run' };
  }
}

/** Generates the reviewed synthetic fail-set candidate bytes deterministically. */
export function generateAiShadowFailSetV1(): GeneratedAiShadowFixture[] {
  return [
    injectTell('the slide', 'metric-theater'),
    injectTell('ecosystem', 'jargon-stack'),
    injectTell('template', 'forced-triplet'),
    injectTell('owner', 'clipped-run'),
  ];
}
