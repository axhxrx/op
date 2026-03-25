import { expect, test } from 'bun:test';
import { ExecOp } from './ExecOp.ts';

test('ExecOp succeeds and captures stdout/stderr for non-zero exit codes', async () =>
{
  const outcome = await new ExecOp([
    'sh',
    '-c',
    'printf out; printf err 1>&2; exit 7',
  ]).run();

  expect(outcome).toEqual({
    ok: true,
    value: {
      exitCode: 7,
      signal: null,
      stdout: 'out',
      stderr: 'err',
    },
  });
});

test('ExecOp returns commandNotFound for missing commands', async () =>
{
  const outcome = await new ExecOp(['definitely-not-a-real-command-xyz']).run();

  expect(outcome).toEqual({
    ok: false,
    failure: 'commandNotFound',
    debugData: 'Command not found: definitely-not-a-real-command-xyz',
  });
});

test('ExecOp pipes stdinInput to the subprocess', async () =>
{
  const outcome = await new ExecOp(['sh', '-c', 'cat'], {
    stdinInput: 'hello from stdin',
  }).run();

  expect(outcome).toEqual({
    ok: true,
    value: {
      exitCode: 0,
      signal: null,
      stdout: 'hello from stdin',
      stderr: '',
    },
  });
});

test('ExecOp preserves signal termination details', async () =>
{
  const outcome = await new ExecOp([
    'node',
    '-e',
    "process.kill(process.pid, 'SIGTERM')",
  ]).run();

  expect(outcome).toEqual({
    ok: true,
    value: {
      exitCode: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
    },
  });
});

test('ExecOp ignores EPIPE when a spawned command exits before consuming large stdinInput', async () =>
{
  const outcome = await new ExecOp(['sh', '-c', 'exit 0'], {
    stdinInput: 'x'.repeat(10_000_000),
  }).run();

  expect(outcome).toEqual({
    ok: true,
    value: {
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
    },
  });
});
