export const FEEDBACK_URL = 'https://github.com/shashank-sn/holdyourvoice/issues/new?template=feedback.yml';

export interface FeedbackContext {
  command: string | undefined;
  isTTY: boolean;
  env: NodeJS.ProcessEnv;
}

// hyv makes no network calls, so a printed link is the only way to hear from the people who run it.
// The line goes to stderr and only to a person at a terminal, so piped and agent output stays unchanged.
export function feedbackNotice({ command, isTTY, env }: FeedbackContext): string | undefined {
  if (!isTTY || !command || command === 'mcp') return undefined;
  if (env.HYV_NO_FEEDBACK || env.CI) return undefined;
  return `hyv: tell me what you use this for. it takes one minute: ${FEEDBACK_URL} (hide this line: HYV_NO_FEEDBACK=1)`;
}
