import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOpRunnerArgs } from './args.ts';

test('empty args returns interactive mode with empty remaining', () =>
{
  const result = parseOpRunnerArgs([]);
  assert.deepStrictEqual(result.opRunner, { mode: 'interactive' });
  assert.deepStrictEqual(result.remaining, []);
});

test('--record sets mode and sessionFile', () =>
{
  const result = parseOpRunnerArgs(['--record', 'session.json']);
  assert.strictEqual(result.opRunner.mode, 'record');
  assert.strictEqual(result.opRunner.sessionFile, 'session.json');
  assert.deepStrictEqual(result.remaining, []);
});

test('--replay sets mode and sessionFile', () =>
{
  const result = parseOpRunnerArgs(['--replay', 'session.json']);
  assert.strictEqual(result.opRunner.mode, 'replay');
  assert.strictEqual(result.opRunner.sessionFile, 'session.json');
  assert.deepStrictEqual(result.remaining, []);
});

test('--log sets logFile without changing mode', () =>
{
  const result = parseOpRunnerArgs(['--log', 'output.log']);
  assert.strictEqual(result.opRunner.mode, 'interactive');
  assert.strictEqual(result.opRunner.logFile, 'output.log');
  assert.deepStrictEqual(result.remaining, []);
});

test('--record without file throws', () =>
{
  assert.throws(() => parseOpRunnerArgs(['--record']), /--record requires a file path/);
});

test('--replay without file throws', () =>
{
  assert.throws(() => parseOpRunnerArgs(['--replay']), /--replay requires a file path/);
});

test('--log without file throws', () =>
{
  assert.throws(() => parseOpRunnerArgs(['--log']), /--log requires a file path/);
});

test('non-framework args pass through to remaining', () =>
{
  const result = parseOpRunnerArgs(['--verbose', 'myfile.txt', '-n', '5']);
  assert.strictEqual(result.opRunner.mode, 'interactive');
  assert.deepStrictEqual(result.remaining, ['--verbose', 'myfile.txt', '-n', '5']);
});

test('framework and app args are separated correctly', () =>
{
  const result = parseOpRunnerArgs(['--record', 'session.json', '--log', 'out.log', '--verbose', 'myfile.txt']);
  assert.strictEqual(result.opRunner.mode, 'record');
  assert.strictEqual(result.opRunner.sessionFile, 'session.json');
  assert.strictEqual(result.opRunner.logFile, 'out.log');
  assert.deepStrictEqual(result.remaining, ['--verbose', 'myfile.txt']);
});

test('--record and --replay together throws', () =>
{
  assert.throws(() => parseOpRunnerArgs(['--record', 'a.json', '--replay', 'b.json']),
    /--record and --replay cannot be used together/);
});

test('--replay and --record together throws', () =>
{
  assert.throws(() => parseOpRunnerArgs(['--replay', 'a.json', '--record', 'b.json']),
    /--record and --replay cannot be used together/);
});
