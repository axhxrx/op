import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { FetchUserOp, PrintOp } from './Op.examples.ts';
import { Op } from './Op.ts';
import type { OutcomeOf } from './Outcome.ts';
import { patchConsole, unpatchConsole } from './patchConsole.ts';
import { SharedContext } from './SharedContext.ts';

test('PrintOp - success case', async () =>
{
  const op = new PrintOp('Hello, world!', ['bad', 'word']);
  const outcome = await op.run();

  // Type assertion to prove TypeScript infers correctly
  if (outcome.ok)
  {
    // TypeScript knows outcome.value is string
    const value: string = outcome.value;
    expect(value).toBe('Hello, world!');
  }
  else
  {
    throw new Error('Expected success');
  }
});

test('PrintOp - ProhibitedWord failure', async () =>
{
  const op = new PrintOp('This is a bad message', ['bad']);
  const outcome = await op.run();

  if (!outcome.ok)
  {
    // TypeScript knows the exact failure types
    type FailureType = typeof outcome.failure;
    const failure: FailureType = outcome.failure;

    // Prove exhaustive checking works
    switch (failure)
    {
      case 'ProhibitedWord':
        // assertEquals(failure, "ProhibitedWord");
        expect(failure).toBe('ProhibitedWord');
        break;
      case 'MessageTooLong':
        throw new Error('Wrong failure type');
      case 'unknownError':
        throw new Error('Wrong failure type');
        // If we missed a case, TypeScript would error here
    }
  }
  else
  {
    throw new Error('Expected failure');
  }
});

test('PrintOp - MessageTooLong failure', async () =>
{
  const longMessage = 'a'.repeat(101);
  const op = new PrintOp(longMessage, { maxLength: 100 });
  const outcome = await op.run();

  if (!outcome.ok)
  {
    // assertEquals(outcome.failure, 'MessageTooLong');
    expect(outcome.failure).toBe('MessageTooLong');
    // assertEquals(outcome.debugData, `Length: ${longMessage.length}, Max: 100`);
    expect(outcome.debugData).toBe(`Length: ${longMessage.length}, Max: 100`);
  }
  else
  {
    throw new Error('Expected failure');
  }
});

test('FetchUserOp - MissingUserId failure', async () =>
{
  const op = new FetchUserOp('');
  const outcome = await op.run();

  if (!outcome.ok)
  {
    // Prove we can exhaustively match on failures
    const _failures:
      | 'MissingUserId'
      | 'InvalidUserId'
      | 'EmailNotFound'
      | 'unknownError' = outcome.failure;

    expect(outcome.failure).toBe('MissingUserId');
  }
  else
  {
    throw new Error('Expected failure');
  }
});

test('FetchUserOp - InvalidUserId failure', async () =>
{
  const op = new FetchUserOp('ab'); // Too short
  const outcome = await op.run();

  if (!outcome.ok)
  {
    expect(outcome.failure).toBe('InvalidUserId');
  }
  else
  {
    throw new Error('Expected failure');
  }
});

test('FetchUserOp - success case', async () =>
{
  const op = new FetchUserOp('user123');
  const outcome = await op.run();

  if (outcome.ok)
  {
    // TypeScript knows the exact shape
    const user: { id: string; name: string; email: string } = outcome.value;
    expect(user.id).toBe('user123');
    expect(user.name).toBe('John Doe');
  }
  else
  {
    throw new Error('Expected success');
  }
});

test('OutcomeOf utility type works correctly', () =>
{
  // This is a compile-time test - if it compiles, it works!

  type PrintOpOutcome = OutcomeOf<PrintOp>;

  // Prove the type is what we expect
  const successOutcome: PrintOpOutcome = {
    ok: true,
    value: 'test',
  };

  const failureOutcome: PrintOpOutcome = {
    ok: false,
    failure: 'ProhibitedWord',
  };

  const anotherFailure: PrintOpOutcome = {
    ok: false,
    failure: 'MessageTooLong',
  };

  expect(successOutcome.ok).toBe(true);
  expect(failureOutcome.ok).toBe(false);
  expect(anotherFailure.ok).toBe(false);

  const _invalidFailure: PrintOpOutcome = {
    ok: false,
    // @ts-expect-error Type '"InvalidFailure"' is not assignable to type '"ProhibitedWord" | "MessageTooLong" | "unknownError"'. (typescript 2322)
    failure: 'InvalidFailure',
  };
});

class CalculateOp extends Op<
  { sum: number; product: number },
  'NegativeInput' | 'InputTooLarge' | 'unknownError'
>
{
  private a: number;
  private b: number;

  constructor(a: number, b: number)
  {
    super();
    this.a = a;
    this.b = b;
  }

  get name(): string
  {
    return `CalculateOp(${this.a}, ${this.b})`;
  }

  async run()
  {
    await Promise.resolve();
    if (this.a < 0 || this.b < 0)
    {
      return this.fail('NegativeInput' as const);
    }

    if (this.a > 1000 || this.b > 1000)
    {
      return this.fail('InputTooLarge' as const);
    }

    // Success type is { sum: number, product: number }
    return this.succeed({
      sum: this.a + this.b,
      product: this.a * this.b,
    });
  }
}

class StaticRunFinalOp extends Op<string, 'unknownError'>
{
  name = 'StaticRunFinalOp';

  async run()
  {
    await Promise.resolve();
    return this.succeed('terminal result');
  }
}

class StaticRunRootOp extends Op<string, 'unknownError'>
{
  name = 'StaticRunRootOp';

  async run()
  {
    await Promise.resolve();
    return this.replaceWith(new StaticRunFinalOp());
  }
}

test('CalculateOp - success with complex return type', async () =>
{
  const op = new CalculateOp(5, 10);
  const outcome = await op.run();

  if (outcome.ok)
  {
    // TypeScript knows the exact shape
    const result: { sum: number; product: number } = outcome.value;
    expect(result.sum).toBe(15);
    expect(result.product).toBe(50);
  }
  else
  {
    throw new Error('Expected success');
  }
});

test('CalculateOp - failure cases', async () =>
{
  const negativeOp = new CalculateOp(-5, 10);
  const negativeOutcome = await negativeOp.run();

  if (!negativeOutcome.ok)
  {
    // Exhaustive type check
    const failure: 'NegativeInput' | 'InputTooLarge' | 'unknownError' = negativeOutcome.failure;
    expect(failure).toBe('NegativeInput');
  }
  else
  {
    throw new Error('Expected failure');
  }

  const largeOp = new CalculateOp(5000, 10);
  const largeOutcome = await largeOp.run();

  if (!largeOutcome.ok)
  {
    expect(largeOutcome.failure).toBe('InputTooLarge');
  }
  else
  {
    throw new Error('Expected failure');
  }
});

test('Op.run() executes through OpRunner and returns terminal outcome', async () =>
{
  const outcome = await StaticRunRootOp.run();

  expect(outcome).toEqual({
    ok: true,
    value: 'terminal result',
  });
});

test('console.log goes through IOContext when patched', () =>
{
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const mockStdout = new PassThrough();
  const mockStderr = new PassThrough();
  mockStdout.setEncoding('utf8');
  mockStderr.setEncoding('utf8');
  mockStdout.on('data', (chunk: string) => stdoutChunks.push(chunk));
  mockStderr.on('data', (chunk: string) => stderrChunks.push(chunk));

  const { createDefaultLogger } = require('./Logger.ts');
  SharedContext.overrideDefaultIOContext = {
    stdin: process.stdin,
    stdout: mockStdout,
    stderr: mockStderr,
    mode: 'test' as const,
    logger: createDefaultLogger(),
  };

  try
  {
    patchConsole();

    console.log('hello from log');
    console.warn('hello from warn');
    console.error('hello from error');

    expect(stdoutChunks.join('')).toContain('hello from log');
    expect(stderrChunks.join('')).toContain('hello from warn');
    expect(stderrChunks.join('')).toContain('hello from error');
    // log should NOT appear in stderr
    expect(stderrChunks.join('')).not.toContain('hello from log');
    // warn/error should NOT appear in stdout
    expect(stdoutChunks.join('')).not.toContain('hello from warn');
    expect(stdoutChunks.join('')).not.toContain('hello from error');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('Type narrowing works correctly', async () =>
{
  const op = new PrintOp('test', []);
  const outcome = await op.run();

  // Before narrowing, outcome is a union type
  type _OutcomeType = typeof outcome;
  // _OutcomeType = Success<string> | Failure<'ProhibitedWord' | 'MessageTooLong' | 'unknownError'>

  if (outcome.ok)
  {
    // After narrowing, TypeScript knows it's Success<string>
    type _SuccessType = typeof outcome; // Success<string>
    const value: string = outcome.value;
    expect(value).toBe('test');

    // @ts-expect-error - 'failure' doesn't exist on Success type
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const _fail = outcome.failure;
  }
  else
  {
    // After narrowing, TypeScript knows it's Failure<...>
    type _FailureType = typeof outcome; // Failure<'ProhibitedWord' | 'MessageTooLong' | 'unknownError'>
    const _failure = outcome.failure;
    const _debugData = outcome.debugData;
    // @ts-expect-error - 'value' doesn't exist on Failure type
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const _val = outcome.value;
  }
});

test('Op.io returns SharedContext.effectiveIOContext', () =>
{
  class IOAccessOp extends Op<string, never>
  {
    name = 'IOAccessOp';
    async run()
    {
      await Promise.resolve();
      // Access this.io to prove it works
      const mode = this.io.mode;
      return this.succeed(mode);
    }
  }

  const mockStdout = new PassThrough();
  const mockStderr = new PassThrough();
  const { createDefaultLogger } = require('./Logger.ts');

  SharedContext.overrideDefaultIOContext = {
    stdin: process.stdin,
    stdout: mockStdout,
    stderr: mockStderr,
    mode: 'test' as const,
    logger: createDefaultLogger(),
  };

  try
  {
    const op = new IOAccessOp();
    expect(op['io'].mode).toBe('test');
  }
  finally
  {
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('Op.fail includes debugData when provided', async () =>
{
  class FailDebugOp extends Op<never, 'badThing'>
  {
    name = 'FailDebugOp';
    async run()
    {
      await Promise.resolve();
      return this.fail('badThing' as const, 'extra info here');
    }
  }

  const outcome = await new FailDebugOp().run();
  if (outcome.ok) throw new Error('Expected failure');
  expect(outcome.failure).toBe('badThing');
  expect(outcome.debugData).toBe('extra info here');
});

test('Op.failWithUnknownError includes debugData', async () =>
{
  class UnknownFailOp extends Op<never, 'unknownError'>
  {
    name = 'UnknownFailOp';
    async run()
    {
      await Promise.resolve();
      return this.failWithUnknownError('something went wrong');
    }
  }

  const outcome = await new UnknownFailOp().run();
  if (outcome.ok) throw new Error('Expected failure');
  expect(outcome.failure).toBe('unknownError');
  expect(outcome.debugData).toBe('something went wrong');
});

test('Op.cancel returns standard canceled failure', async () =>
{
  class CancelOp extends Op<never, 'canceled'>
  {
    name = 'CancelOp';
    async run()
    {
      await Promise.resolve();
      return this.cancel();
    }
  }

  const outcome = await new CancelOp().run();
  expect(outcome).toEqual({ ok: false, failure: 'canceled' });
});

test('PrintOp with empty message succeeds', async () =>
{
  const op = new PrintOp('');
  const outcome = await op.run();
  expect(outcome).toEqual({ ok: true, value: '' });
});

test('PrintOp at exactly maxLength succeeds', async () =>
{
  const msg = 'a'.repeat(100);
  const op = new PrintOp(msg, { maxLength: 100 });
  const outcome = await op.run();
  expect(outcome.ok).toBe(true);
});
