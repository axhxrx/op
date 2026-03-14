import { expect, test } from 'bun:test';
import type { IOContext } from './IOContext.ts';
import { Op } from './Op.ts';

/**
 Test op that can be canceled
 */
class CancelableOp extends Op
{
  name = 'CancelableOp';

  constructor(private shouldCancel: boolean)
  {
    super();
  }

  async run(_io?: IOContext)
  {
    await Promise.resolve();

    if (this.shouldCancel)
    {
      return this.cancel();
    }

    return this.succeed('completed');
  }
}

test('Op.cancel() returns standard canceled failure', async () =>
{
  const op = new CancelableOp(true);
  const outcome = await op.run();

  expect(outcome.ok).toBe(false);

  if (!outcome.ok)
  {
    expect(outcome.failure).toBe('canceled');
    // Type system should know this is 'canceled' literal
    const _failureType: 'canceled' | 'unknownError' = outcome.failure;
  }
});

test('Cancelable op can also succeed', async () =>
{
  const op = new CancelableOp(false);
  const outcome = await op.run();

  expect(outcome.ok).toBe(true);

  if (outcome.ok)
  {
    expect(outcome.value).toBe('completed');
  }
});

test('Cancellation can be distinguished from other failures', async () =>
{
  const op = new CancelableOp(true);
  const outcome = await op.run();

  if (!outcome.ok)
  {
    // Exhaustive checking works
    switch (outcome.failure)
    {
      case 'canceled':
      {
        expect(true).toBe(true); // This should be the path taken
        break;
      }
      // @ts-expect-error This type isn't possible, AFATSK
      case 'unknownError':
      {
        throw new Error('Should not be unknown error');
      }
      default:
      {
        // TypeScript knows we've covered all cases
        const _exhaustive: never = outcome.failure;
        break;
      }
    }
  }
});
