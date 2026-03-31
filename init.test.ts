import { expect, test } from 'bun:test';
import { init } from './init.ts';
import { Op } from './Op.ts';

class SimpleOp extends Op<string, 'unknownError'>
{
  name = 'SimpleOp';
  async execute()
  {
    await Promise.resolve();
    return this.succeed('done');
  }
}

test('init returns args, opsArgs, and opsMain', () =>
{
  const result = init(['--log', '/dev/null', 'myarg']);
  expect(result.args).toEqual(['myarg']);
  expect(result.opsArgs.logFile).toBe('/dev/null');
  expect(typeof result.opsMain).toBe('function');
});

test('init.opsMain executes an op and returns its outcome', async () =>
{
  const { opsMain } = init([]);
  const outcome = await opsMain(new SimpleOp());

  expect(outcome).toEqual({ ok: true, value: 'done' });
});

test('init separates framework args from app args', () =>
{
  const result = init(['--record', 'session.json', '--verbose', 'file.txt']);
  expect(result.opsArgs.mode).toBe('record');
  expect(result.opsArgs.sessionFile).toBe('session.json');
  expect(result.args).toEqual(['--verbose', 'file.txt']);
});
