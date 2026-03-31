import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Op } from './Op.ts';

/**
 Test op that can be canceled
 */
class CancelableOp extends Op<string, 'canceled'>
{
  name = 'CancelableOp';
  private shouldCancel: boolean;

  constructor(shouldCancel: boolean)
  {
    super();
    this.shouldCancel = shouldCancel;
  }

  async execute()
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

  assert.strictEqual(outcome.ok, false);

  if (!outcome.ok)
  {
    assert.strictEqual(outcome.failure, 'canceled');
    // Type system should know this is 'canceled' literal
    const _failureType: 'canceled' | 'unknownError' = outcome.failure;
  }
});

test('Cancelable op can also succeed', async () =>
{
  const op = new CancelableOp(false);
  const outcome = await op.run();

  assert.strictEqual(outcome.ok, true);

  if (outcome.ok)
  {
    assert.strictEqual(outcome.value, 'completed');
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
        assert.strictEqual(true, true); // This should be the path taken
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
