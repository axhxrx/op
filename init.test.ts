import assert from 'node:assert/strict';
import { test } from 'node:test';
import { init } from './init.ts';
import { Op } from './Op.ts';
import { unpatchConsole } from './patchConsole.ts';
import { SharedContext } from './SharedContext.ts';

class SimpleOp extends Op<string, 'unknownError'>
{
  name = 'SimpleOp';
  async execute()
  {
    await Promise.resolve();
    return this.succeed('done');
  }
}

function resetSharedContext(): void
{
  SharedContext.overrideDefaultIOContext = null;
  SharedContext.processDefaultIOContext = null;
  unpatchConsole();
}

test('init returns args, opsArgs, and opsMain', () =>
{
  resetSharedContext();
  try
  {
    const result = init(['--log', '/dev/null', 'myarg']);
    assert.deepStrictEqual(result.args, ['myarg']);
    assert.strictEqual(result.opsArgs.logFile, '/dev/null');
    assert.strictEqual(typeof result.opsMain, 'function');
  }
  finally
  {
    resetSharedContext();
  }
});

test('init.opsMain executes an op and returns its outcome', async () =>
{
  resetSharedContext();
  try
  {
    const { opsMain } = init([]);
    const outcome = await opsMain(new SimpleOp());

    assert.deepStrictEqual(outcome, { ok: true, value: 'done' });
  }
  finally
  {
    resetSharedContext();
  }
});

test('init separates framework args from app args', () =>
{
  resetSharedContext();
  try
  {
    const result = init(['--record', 'session.json', '--verbose', 'file.txt']);
    assert.strictEqual(result.opsArgs.mode, 'record');
    assert.strictEqual(result.opsArgs.sessionFile, 'session.json');
    assert.deepStrictEqual(result.args, ['--verbose', 'file.txt']);
  }
  finally
  {
    resetSharedContext();
  }
});
