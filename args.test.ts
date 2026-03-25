import { expect, test } from 'bun:test';
import { parseOpRunnerArgs } from './args.ts';

test('empty args returns interactive mode with empty remaining', () =>
{
  const result = parseOpRunnerArgs([]);
  expect(result.opRunner).toEqual({ mode: 'interactive' });
  expect(result.remaining).toEqual([]);
});

test('--record sets mode and sessionFile', () =>
{
  const result = parseOpRunnerArgs(['--record', 'session.json']);
  expect(result.opRunner.mode).toBe('record');
  expect(result.opRunner.sessionFile).toBe('session.json');
  expect(result.remaining).toEqual([]);
});

test('--replay sets mode and sessionFile', () =>
{
  const result = parseOpRunnerArgs(['--replay', 'session.json']);
  expect(result.opRunner.mode).toBe('replay');
  expect(result.opRunner.sessionFile).toBe('session.json');
  expect(result.remaining).toEqual([]);
});

test('--log sets logFile without changing mode', () =>
{
  const result = parseOpRunnerArgs(['--log', 'output.log']);
  expect(result.opRunner.mode).toBe('interactive');
  expect(result.opRunner.logFile).toBe('output.log');
  expect(result.remaining).toEqual([]);
});

test('--record without file throws', () =>
{
  expect(() => parseOpRunnerArgs(['--record'])).toThrow('--record requires a file path');
});

test('--replay without file throws', () =>
{
  expect(() => parseOpRunnerArgs(['--replay'])).toThrow('--replay requires a file path');
});

test('--log without file throws', () =>
{
  expect(() => parseOpRunnerArgs(['--log'])).toThrow('--log requires a file path');
});

test('non-framework args pass through to remaining', () =>
{
  const result = parseOpRunnerArgs(['--verbose', 'myfile.txt', '-n', '5']);
  expect(result.opRunner.mode).toBe('interactive');
  expect(result.remaining).toEqual(['--verbose', 'myfile.txt', '-n', '5']);
});

test('framework and app args are separated correctly', () =>
{
  const result = parseOpRunnerArgs(['--record', 'session.json', '--log', 'out.log', '--verbose', 'myfile.txt']);
  expect(result.opRunner.mode).toBe('record');
  expect(result.opRunner.sessionFile).toBe('session.json');
  expect(result.opRunner.logFile).toBe('out.log');
  expect(result.remaining).toEqual(['--verbose', 'myfile.txt']);
});

test('--record and --replay together throws', () =>
{
  expect(() => parseOpRunnerArgs(['--record', 'a.json', '--replay', 'b.json']))
    .toThrow('--record and --replay cannot be used together');
});

test('--replay and --record together throws', () =>
{
  expect(() => parseOpRunnerArgs(['--replay', 'a.json', '--record', 'b.json']))
    .toThrow('--record and --replay cannot be used together');
});
