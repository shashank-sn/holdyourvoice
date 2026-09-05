#!/usr/bin/env node
import { runAgent } from './cli/agents.js';
import { runProfile, runScore, runBacktest, runEvaluateLocal, runIngest, runTeamProfile } from './cli/profiles.js';
import { runDeliveryCheck, runAnalyze, runStrictCheck, runHygiene, runInspectHiddenText, runApplyHiddenTextPolicy, runFinalCheck, runFactLint, runLogicLint, runBatchAnalyze, runVerify, runVerifySpec, runPatterns, runDispositions } from './cli/checks.js';
import { runRewritePrompt, runPrepareRewrite, runApplyRewrite, runPrepareJudgment, runReduceJudgment, runPrepareRebuild, runApplyRebuild, runRebuildWriterRequest } from './cli/rewriting.js';
import { runLifecycle, runLearning } from './cli/lifecycle.js';

const usage = 'Commands: agent, profile, team-profile, analyze, score, backtest, evaluate-local, ingest, strict-check, hygiene, inspect-hidden-text, apply-hidden-text-policy, final-check, delivery-check, fact-lint, logic-lint, batch-analyze, rewrite-prompt, prepare-rewrite, apply-rewrite, prepare-judgment, reduce-judgment, prepare-rebuild, rebuild-writer-request, apply-rebuild, verify, verify-spec, lifecycle, learning, patterns, dispositions, mcp';

type CommandHandler = (args: string[]) => number | Promise<number>;

async function runMcp(args: string[]): Promise<number> {
  if (args.length > 0) throw new Error('Usage: hyv mcp');
  await import('./mcp.js');
  return 0;
}

const commandHandlers: Record<string, CommandHandler> = {
  agent: runAgent,
  profile: runProfile,
  'team-profile': runTeamProfile,
  analyze: runAnalyze,
  score: runScore,
  backtest: runBacktest,
  'evaluate-local': runEvaluateLocal,
  ingest: runIngest,
  'strict-check': runStrictCheck,
  hygiene: runHygiene,
  'inspect-hidden-text': runInspectHiddenText,
  'apply-hidden-text-policy': runApplyHiddenTextPolicy,
  'final-check': runFinalCheck,
  'delivery-check': runDeliveryCheck,
  'fact-lint': runFactLint,
  'logic-lint': runLogicLint,
  'batch-analyze': runBatchAnalyze,
  'rewrite-prompt': runRewritePrompt,
  'prepare-rewrite': runPrepareRewrite,
  'apply-rewrite': runApplyRewrite,
  'prepare-judgment': runPrepareJudgment,
  'reduce-judgment': runReduceJudgment,
  'prepare-rebuild': runPrepareRebuild,
  'apply-rebuild': runApplyRebuild,
  'rebuild-writer-request': runRebuildWriterRequest,
  verify: runVerify,
  'verify-spec': runVerifySpec,
  lifecycle: runLifecycle,
  learning: runLearning,
  patterns: runPatterns,
  dispositions: runDispositions,
  mcp: runMcp,
};

export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const handler = command ? commandHandlers[command] : undefined;
  if (!handler) throw new Error(`${usage}.`);
  return handler(rest);
}

void (async () => {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
})();
