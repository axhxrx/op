import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createIOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { Failure, RunResult, Success } from './Outcome.ts';
import { unpatchConsole } from './patchConsole.ts';

class SimpleOp extends Op<string, 'unknownError'>
{
  name = 'SimpleOp';
  private value: string;

  constructor(value: string)
  {
    super();
    this.value = value;
  }

  async run(): Promise<Success<string> | Failure<'unknownError'>>
  {
    await Promise.resolve();
    return this.succeed(this.value);
  }
}

class ReplacingOp extends Op<string, 'unknownError'>
{
  name = 'ReplacingOp';

  async run(): Promise<RunResult<string, 'unknownError'>>
  {
    await Promise.resolve();
    return this.replaceWith(new SimpleOp('replaced'));
  }
}

class OutOfBandCallerOp extends Op<string, 'unknownError'>
{
  name = 'OutOfBandCallerOp';

  async run(): Promise<Success<string> | Failure<'unknownError'>>
  {
    // This op calls Op.run() which should use runOutOfBand on the current runner
    const innerOutcome = await SimpleOp.run('from-inner');
    if (!innerOutcome.ok) return this.failWithUnknownError();
    return this.succeed(`outer-got-${innerOutcome.value}`);
  }
}

class DoubleNestedOp extends Op<string, 'unknownError'>
{
  name = 'DoubleNestedOp';

  async run(): Promise<Success<string> | Failure<'unknownError'>>
  {
    // This op calls Op.run() which calls another Op.run() — tests reentrancy
    const innerOutcome = await OutOfBandCallerOp.run();
    if (!innerOutcome.ok) return this.failWithUnknownError();
    return this.succeed(`deep-${innerOutcome.value}`);
  }
}

function resetRunner(): void
{
  // Clear any leftover default runner from previous tests
  (OpRunner as unknown as { _default: undefined })._default = undefined;
  unpatchConsole();
}

test('runOutOfBand executes a simple op and returns its outcome', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new SimpleOp('root'), { mode: 'test' });
  const outcome = await runner.runOutOfBand(new SimpleOp('oob'));

  expect(outcome).toEqual({ ok: true, value: 'oob' });

  // The main runner's stack should be unaffected
  const mainOutcome = await runner.run();
  expect(mainOutcome).toEqual({ ok: true, value: 'root' });
  resetRunner();
});

test('runOutOfBand handles control flow (replaceWith)', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new SimpleOp('root'), { mode: 'test' });
  const outcome = await runner.runOutOfBand(new ReplacingOp());

  expect(outcome).toEqual({ ok: true, value: 'replaced' });
  resetRunner();
});

test('Op.run() delegates to runOutOfBand when default runner exists', async () =>
{
  resetRunner();
  const io = await createIOContext({ mode: 'test' }, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  const runner = await OpRunner.create(new SimpleOp('root'), { mode: 'test' }, io);

  // Op.run() should use the default runner's runOutOfBand
  const outcome = await SimpleOp.run('via-static');
  expect(outcome).toEqual({ ok: true, value: 'via-static' });

  // Default runner should still be the same
  expect(OpRunner.default).toBe(runner);

  // Clean up
  await runner.run();
  resetRunner();
});

test('Op.run() is reentrant — nested Op.run() calls work', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new OutOfBandCallerOp(), { mode: 'test' });
  const outcome = await runner.run();

  expect(outcome).toEqual({ ok: true, value: 'outer-got-from-inner' });
  resetRunner();
});

test('Op.run() is deeply reentrant — double-nested Op.run() calls work', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new DoubleNestedOp(), { mode: 'test' });
  const outcome = await runner.run();

  expect(outcome).toEqual({ ok: true, value: 'deep-outer-got-from-inner' });
  resetRunner();
});

test('stale runner is cleared after run() completes', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new SimpleOp('done'), { mode: 'test' });
  expect(OpRunner.default).toBe(runner);

  await runner.run();

  // Default should be cleared after run() completes
  expect(OpRunner.default).toBeUndefined();
  expect(OpRunner.defaultIOContext).toBeUndefined();
  resetRunner();
});

test('Op.run() creates fresh runner after previous runner completed', async () =>
{
  resetRunner();

  // First runner runs and completes
  const runner1 = await OpRunner.create(new SimpleOp('first'), { mode: 'test' });
  await runner1.run();
  expect(OpRunner.default).toBeUndefined();

  // Now Op.run() should create a fresh runner, not use the stale one
  const outcome = await SimpleOp.run('fresh');
  expect(outcome).toEqual({ ok: true, value: 'fresh' });

  // The fresh runner also completed, so default should be cleared again
  expect(OpRunner.default).toBeUndefined();
  resetRunner();
});

test('instance run() works for simple ops (terminal outcomes)', async () =>
{
  resetRunner();
  // Calling instance run() directly bypasses OpRunner entirely.
  // It works fine for ops that return terminal outcomes.
  const op = new SimpleOp('direct');
  const outcome = await op.run();
  expect(outcome).toEqual({ ok: true, value: 'direct' });
  resetRunner();
});

test('instance run() returns raw control flow value (not a terminal outcome) for ops using replaceWith', async () =>
{
  resetRunner();
  // When an op uses replaceWith(), calling instance run() directly returns
  // the control flow value instead of the terminal outcome. OpRunner is
  // needed to process control flow. This test documents the limitation.
  const op = new ReplacingOp();
  const result = await op.run();

  // This is NOT a terminal outcome — it's a raw control flow value.
  // It has a Symbol key, not ok/value/failure.
  expect('ok' in result).toBe(false);
  resetRunner();
});

test('static Op.run() handles control flow correctly (contrast with instance run())', async () =>
{
  resetRunner();
  // The static Op.run() goes through OpRunner, which processes control flow.
  // So replaceWith() works correctly and returns the terminal outcome.
  const outcome = await ReplacingOp.run();
  expect(outcome).toEqual({ ok: true, value: 'replaced' });
  resetRunner();
});

test('runOutOfBand shares IOContext with primary runner', async () =>
{
  resetRunner();
  const stdoutChunks: string[] = [];
  const mockStdout = new PassThrough();
  mockStdout.setEncoding('utf8');
  mockStdout.on('data', (chunk: string) => stdoutChunks.push(chunk));

  const io = await createIOContext({ mode: 'test' }, {
    stdout: mockStdout,
    stderr: new PassThrough(),
  });
  const runner = await OpRunner.create(new SimpleOp('root'), { mode: 'test' }, io);

  // Run a PrintOp-like thing out of band — it should write to the same stdout
  class PrintingOp extends Op<void, never>
  {
    name = 'PrintingOp';
    async run(): Promise<Success<void>>
    {
      this.io.stdout.write('oob-output');
      return this.succeed(undefined);
    }
  }

  await runner.runOutOfBand(new PrintingOp());
  expect(stdoutChunks.join('')).toContain('oob-output');

  await runner.run();
  resetRunner();
});
