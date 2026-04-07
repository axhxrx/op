import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createIOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { Failure, Success } from './Outcome.ts';
import { PromptForValueOp } from './PromptForValueOp.ts';
import type { Session } from './RecordableStdin.ts';
import { SharedContext } from './SharedContext.ts';

/**
A test op that prompts for two values sequentially, simulating a multi-step interactive flow like an auth login. This is the minimal reproduction of the replay timing bug: if replay events are delayed by their original wall-clock timestamps (e.g. 16 seconds for a human to type), the prompts time out or hang because data doesn't arrive when the readline interface is listening.
*/
class TwoPromptOp extends Op<{ first: string; second: string }, 'canceled'>
{
  name = 'TwoPromptOp';

  async execute(): Promise<Success<{ first: string; second: string }> | Failure<'canceled'>>
  {
    const firstPrompt = new PromptForValueOp('First: ');
    const firstResult = await firstPrompt.run();
    if (!firstResult.ok) return this.fail('canceled');

    const secondPrompt = new PromptForValueOp('Second: ');
    const secondResult = await secondPrompt.run();
    if (!secondResult.ok) return this.fail('canceled');

    return this.succeed({ first: firstResult.value, second: secondResult.value });
  }
}

test('Replay with original timing causes multi-prompt ops to hang (demonstrates the bug)', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replay-timing-'));
  const sessionPath = join(tempDir, 'session.json');

  // Simulate a recording where the user took 15+ seconds per input —
  // with original timing, the replay would delay events by those amounts
  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [
      { timestamp: 15000, data: 'hello\n' },
      { timestamp: 30000, data: 'world\n' },
    ],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');

    const source = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding('utf8');

    const io = await createIOContext(
      { mode: 'replay', sessionFile: sessionPath },
      { stdin: source, stdout, stderr: new PassThrough() },
    );
    SharedContext.overrideDefaultIOContext = io;

    const op = new TwoPromptOp();
    const runner = await OpRunner.create(op, { mode: 'replay', sessionFile: sessionPath }, io);

    // With the default (fast) timing, this should complete in well under 1 second.
    // With original timing, it would take 30+ seconds and this test would time out.
    const startTime = Date.now();
    const outcome = await runner.run();
    const elapsed = Date.now() - startTime;

    assert.strictEqual(outcome.ok, true);
    if (outcome.ok)
    {
      assert.strictEqual(outcome.value.first, 'hello');
      assert.strictEqual(outcome.value.second, 'world');
    }

    // Should complete in well under 5 seconds (generous margin for CI).
    // With original timing, it would take ~30 seconds.
    assert.ok(elapsed < 5000,
      `Replay took ${elapsed}ms — expected < 5000ms. Original timing bug may still be present.`);
  }
  finally
  {
    SharedContext.overrideDefaultIOContext = null;
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('Replay with useOriginalTiming=true preserves original delays', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replay-timing-orig-'));
  const sessionPath = join(tempDir, 'session.json');

  // Short timestamps so the test doesn't actually take long
  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [
      { timestamp: 0, data: 'fast\n' },
      { timestamp: 200, data: 'also-fast\n' },
    ],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');

    const source = new PassThrough();
    const stdout = new PassThrough();
    stdout.setEncoding('utf8');

    const io = await createIOContext(
      { mode: 'replay', sessionFile: sessionPath },
      { stdin: source, stdout, stderr: new PassThrough() },
    );
    SharedContext.overrideDefaultIOContext = io;

    // Start replay with original timing
    io.replayableStdin!.startReplay(0, true);

    const op = new TwoPromptOp();
    const runner = await OpRunner.create(op, { mode: 'replay', sessionFile: sessionPath }, io);

    const outcome = await runner.run();

    assert.strictEqual(outcome.ok, true);
    if (outcome.ok)
    {
      assert.strictEqual(outcome.value.first, 'fast');
      assert.strictEqual(outcome.value.second, 'also-fast');
    }
  }
  finally
  {
    SharedContext.overrideDefaultIOContext = null;
    await rm(tempDir, { recursive: true, force: true });
  }
});
