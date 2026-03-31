import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Op } from './Op.ts';
import {
  isFailure,
  isOutcome,
  isSuccess,
} from './Outcome.ts';

test('isSuccess returns true for valid Success', () =>
{
  assert.strictEqual(isSuccess({ ok: true, value: 'hello' }), true);
  assert.strictEqual(isSuccess({ ok: true, value: null }), true);
  assert.strictEqual(isSuccess({ ok: true, value: undefined }), true);
  assert.strictEqual(isSuccess({ ok: true, value: 0 }), true);
});

test('isSuccess returns false for non-Success values', () =>
{
  assert.strictEqual(isSuccess({ ok: false, failure: 'err' }), false);
  assert.strictEqual(isSuccess({ ok: true }), false); // missing 'value' key
  assert.strictEqual(isSuccess({ ok: 'true', value: 1 }), false); // ok is string
  assert.strictEqual(isSuccess(null), false);
  assert.strictEqual(isSuccess(undefined), false);
  assert.strictEqual(isSuccess('string'), false);
  assert.strictEqual(isSuccess(42), false);
  assert.strictEqual(isSuccess({}), false);
});

test('isFailure returns true for valid Failure', () =>
{
  assert.strictEqual(isFailure({ ok: false, failure: 'err' }), true);
  assert.strictEqual(isFailure({ ok: false, failure: 'err', debugData: 'info' }), true);
  assert.strictEqual(isFailure({ ok: false, failure: null }), true);
});

test('isFailure returns false for non-Failure values', () =>
{
  assert.strictEqual(isFailure({ ok: true, value: 'hello' }), false);
  assert.strictEqual(isFailure({ ok: false }), false); // missing 'failure' key
  assert.strictEqual(isFailure({ ok: 'false', failure: 'x' }), false); // ok is string
  assert.strictEqual(isFailure(null), false);
  assert.strictEqual(isFailure(undefined), false);
  assert.strictEqual(isFailure({}), false);
});

test('isOutcome returns true for both Success and Failure', () =>
{
  assert.strictEqual(isOutcome({ ok: true, value: 'hello' }), true);
  assert.strictEqual(isOutcome({ ok: false, failure: 'err' }), true);
});

test('isOutcome returns false for non-Outcome values', () =>
{
  assert.strictEqual(isOutcome(null), false);
  assert.strictEqual(isOutcome(undefined), false);
  assert.strictEqual(isOutcome({}), false);
  assert.strictEqual(isOutcome({ ok: true }), false); // missing value
  assert.strictEqual(isOutcome({ ok: false }), false); // missing failure
});

class DummyOp extends Op<string, 'fail'>
{
  name = 'DummyOp';
  async execute()
  {
    await Promise.resolve();
    return this.succeed('ok');
  }
}

test('DummyOp returns valid outcome', async () =>
{
  const op = new DummyOp();
  const outcome = await op.run();
  assert.strictEqual(isSuccess(outcome), true);
  assert.deepStrictEqual(outcome, { ok: true, value: 'ok' });
});
