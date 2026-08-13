#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  EvaluationContractError,
  commitProtocol,
  freezeBlind,
  preflight,
  recordCheckpointDisposition,
  recordRating,
  reduceEvaluation,
  sealRatings,
  validateRuns,
} from '../dist/stage1-evaluation.js';

function args(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) result._.push(value);
    else {
      const key = value.slice(2);
      const next = values[index + 1];
      if (!next || next.startsWith('--')) result[key] = true;
      else { result[key] = next; index += 1; }
    }
  }
  return result;
}

function required(options, name) {
  if (typeof options[name] !== 'string' || options[name].length === 0) throw new EvaluationContractError(`argument_${name.replaceAll('-', '_')}_required`);
  return options[name];
}

function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function records(path) {
  const body = readFileSync(path, 'utf8').trim();
  if (!body) return [];
  if (body.startsWith('[')) return JSON.parse(body);
  return body.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

const options = args(process.argv.slice(2));
const command = options._[0];

try {
  let output;
  switch (command) {
    case 'commit-protocol': output = commitProtocol(json(required(options, 'protocol'))); break;
    case 'preflight': output = preflight(json(required(options, 'protocol'))); break;
    case 'validate-runs': output = validateRuns(json(required(options, 'protocol')), records(required(options, 'runs'))); break;
    case 'freeze-blind': output = freezeBlind(json(required(options, 'protocol')), records(required(options, 'runs')), json(required(options, 'mapping')), json(required(options, 'contents')), options['non-reviewable'] ? records(options['non-reviewable']) : []); break;
    case 'record-rating': output = recordRating(json(required(options, 'packet')), records(required(options, 'ratings')), json(required(options, 'rating'))); break;
    case 'seal-ratings': output = sealRatings(json(required(options, 'packet')), json(required(options, 'mapping')), records(required(options, 'ratings'))); break;
    case 'reduce': output = reduceEvaluation(json(required(options, 'protocol')), records(required(options, 'runs')), json(required(options, 'packet')), json(required(options, 'mapping')), records(required(options, 'ratings')), json(required(options, 'seal')), json(required(options, 'release-audit'))); break;
    case 'record-checkpoint-disposition': output = recordCheckpointDisposition(json(required(options, 'report')), required(options, 'disposition'), json(required(options, 'attestation'))); break;
    default: throw new EvaluationContractError('command_invalid');
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  const code = error instanceof EvaluationContractError ? error.code : 'invalid_input';
  process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
  process.exitCode = 1;
}
