import { expect, test } from 'bun:test';
import { Op } from './Op.ts';
import {
  isFailure,
  isOutcome,
  isSuccess,
} from './Outcome.ts';

test('isSuccess returns true for valid Success', () =>
{
  expect(isSuccess({ ok: true, value: 'hello' })).toBe(true);
  expect(isSuccess({ ok: true, value: null })).toBe(true);
  expect(isSuccess({ ok: true, value: undefined })).toBe(true);
  expect(isSuccess({ ok: true, value: 0 })).toBe(true);
});

test('isSuccess returns false for non-Success values', () =>
{
  expect(isSuccess({ ok: false, failure: 'err' })).toBe(false);
  expect(isSuccess({ ok: true })).toBe(false); // missing 'value' key
  expect(isSuccess({ ok: 'true', value: 1 })).toBe(false); // ok is string
  expect(isSuccess(null)).toBe(false);
  expect(isSuccess(undefined)).toBe(false);
  expect(isSuccess('string')).toBe(false);
  expect(isSuccess(42)).toBe(false);
  expect(isSuccess({})).toBe(false);
});

test('isFailure returns true for valid Failure', () =>
{
  expect(isFailure({ ok: false, failure: 'err' })).toBe(true);
  expect(isFailure({ ok: false, failure: 'err', debugData: 'info' })).toBe(true);
  expect(isFailure({ ok: false, failure: null })).toBe(true);
});

test('isFailure returns false for non-Failure values', () =>
{
  expect(isFailure({ ok: true, value: 'hello' })).toBe(false);
  expect(isFailure({ ok: false })).toBe(false); // missing 'failure' key
  expect(isFailure({ ok: 'false', failure: 'x' })).toBe(false); // ok is string
  expect(isFailure(null)).toBe(false);
  expect(isFailure(undefined)).toBe(false);
  expect(isFailure({})).toBe(false);
});

test('isOutcome returns true for both Success and Failure', () =>
{
  expect(isOutcome({ ok: true, value: 'hello' })).toBe(true);
  expect(isOutcome({ ok: false, failure: 'err' })).toBe(true);
});

test('isOutcome returns false for non-Outcome values', () =>
{
  expect(isOutcome(null)).toBe(false);
  expect(isOutcome(undefined)).toBe(false);
  expect(isOutcome({})).toBe(false);
  expect(isOutcome({ ok: true })).toBe(false); // missing value
  expect(isOutcome({ ok: false })).toBe(false); // missing failure
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
  expect(isSuccess(outcome)).toBe(true);
  expect(outcome).toEqual({ ok: true, value: 'ok' });
});
