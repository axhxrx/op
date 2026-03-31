import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createIOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { Failure, Success } from './Outcome.ts';
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

  async execute(): Promise<Success<string> | Failure<'unknownError'>>
  {
    await Promise.resolve();
    return this.succeed(this.value);
  }
}

class OutOfBandCallerOp extends Op<string, 'unknownError'>
{
  name = 'OutOfBandCallerOp';

  async execute(): Promise<Success<string> | Failure<'unknownError'>>
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

  async execute(): Promise<Success<string> | Failure<'unknownError'>>
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

  assert.deepStrictEqual(outcome, { ok: true, value: 'oob' });

  // The main runner's stack should be unaffected
  const mainOutcome = await runner.run();
  assert.deepStrictEqual(mainOutcome, { ok: true, value: 'root' });
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
  assert.deepStrictEqual(outcome, { ok: true, value: 'via-static' });

  // Default runner should still be the same
  assert.strictEqual(OpRunner.default, runner);

  // Clean up
  await runner.run();
  resetRunner();
});

test('Op.run() is reentrant — nested Op.run() calls work', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new OutOfBandCallerOp(), { mode: 'test' });
  const outcome = await runner.run();

  assert.deepStrictEqual(outcome, { ok: true, value: 'outer-got-from-inner' });
  resetRunner();
});

test('Op.run() is deeply reentrant — double-nested Op.run() calls work', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new DoubleNestedOp(), { mode: 'test' });
  const outcome = await runner.run();

  assert.deepStrictEqual(outcome, { ok: true, value: 'deep-outer-got-from-inner' });
  resetRunner();
});

test('stale runner is cleared after run() completes', async () =>
{
  resetRunner();
  const runner = await OpRunner.create(new SimpleOp('done'), { mode: 'test' });
  assert.strictEqual(OpRunner.default, runner);

  await runner.run();

  // Default should be cleared after run() completes
  assert.strictEqual(OpRunner.default, undefined);
  assert.strictEqual(OpRunner.defaultIOContext, undefined);
  resetRunner();
});

test('Op.run() creates fresh runner after previous runner completed', async () =>
{
  resetRunner();

  // First runner runs and completes
  const runner1 = await OpRunner.create(new SimpleOp('first'), { mode: 'test' });
  await runner1.run();
  assert.strictEqual(OpRunner.default, undefined);

  // Now Op.run() should create a fresh runner, not use the stale one
  const outcome = await SimpleOp.run('fresh');
  assert.deepStrictEqual(outcome, { ok: true, value: 'fresh' });

  // The fresh runner also completed, so default should be cleared again
  assert.strictEqual(OpRunner.default, undefined);
  resetRunner();
});

test('instance run() goes through OpRunner', async () =>
{
  resetRunner();
  const op = new SimpleOp('direct');
  const outcome = await op.run();
  assert.deepStrictEqual(outcome, { ok: true, value: 'direct' });
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

  // Run a PrintingOp-like thing out of band — it should write to the same stdout
  class PrintingOp extends Op<void, never>
  {
    name = 'PrintingOp';
    async execute(): Promise<Success<void>>
    {
      await Promise.resolve();
      this.io.stdout.write('oob-output');
      return this.succeed(undefined);
    }
  }

  await runner.runOutOfBand(new PrintingOp());
  assert.ok(stdoutChunks.join('').includes('oob-output'));

  await runner.run();
  resetRunner();
});
