import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOp } from './isOp.ts';
import { Op } from './Op.ts';

class TestOp extends Op<string, never>
{
  name = 'TestOp';
  async execute()
  {
    await Promise.resolve();
    return this.succeed('ok');
  }
}

test('isOp returns true for Op subclass instances', () =>
{
  assert.strictEqual(isOp(new TestOp()), true);
});

test('isOp returns false for non-Op values', () =>
{
  assert.strictEqual(isOp(null), false);
  assert.strictEqual(isOp(undefined), false);
  assert.strictEqual(isOp(42), false);
  assert.strictEqual(isOp('string'), false);
  assert.strictEqual(isOp({}), false);
  assert.strictEqual(isOp({ name: 'fake', run: () => Promise.resolve() }), false);
  assert.strictEqual(isOp(TestOp), false); // class itself, not instance
});
