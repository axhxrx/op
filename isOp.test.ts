import { expect, test } from 'bun:test';
import { isOp } from './isOp.ts';
import { Op } from './Op.ts';

class TestOp extends Op<string, never>
{
  name = 'TestOp';
  async run()
  {
    await Promise.resolve();
    return this.succeed('ok');
  }
}

test('isOp returns true for Op subclass instances', () =>
{
  expect(isOp(new TestOp())).toBe(true);
});

test('isOp returns false for non-Op values', () =>
{
  expect(isOp(null)).toBe(false);
  expect(isOp(undefined)).toBe(false);
  expect(isOp(42)).toBe(false);
  expect(isOp('string')).toBe(false);
  expect(isOp({})).toBe(false);
  expect(isOp({ name: 'fake', run: () => Promise.resolve() })).toBe(false);
  expect(isOp(TestOp)).toBe(false); // class itself, not instance
});
