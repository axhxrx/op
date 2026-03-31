import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { init } from './init.ts';
import { createIOContext } from './IOContext.ts';
import { main } from './main.ts';
import { match } from './Op.examples.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import { unpatchConsole } from './patchConsole.ts';
import { SharedContext } from './SharedContext.ts';

class LoggingOp extends Op<string, never>
{
  name: string;
  private message: string;

  constructor(message: string)
  {
    super();
    this.message = message;
    this.name = `LoggingOp(${message})`;
  }

  async execute()
  {
    await Promise.resolve();
    console.log(this.message);
    return this.succeed(this.message);
  }
}

function resetGlobalState(): void
{
  SharedContext.overrideDefaultIOContext = null;
  SharedContext.processDefaultIOContext = null;
  (OpRunner as unknown as { _default: undefined })._default = undefined;
  unpatchConsole();
}

async function waitForIOFlush(): Promise<void>
{
  await new Promise<void>(resolve => setTimeout(resolve, 20));
}

test('main preserves process-scoped logging before, during, and after the root run', async () =>
{
  resetGlobalState();

  const tempDir = await mkdtemp(join(tmpdir(), 'main-log-'));
  const logFile = join(tempDir, 'main.log');
  const savedArgv = process.argv;

  try
  {
    process.argv = ['node', 'script', '--log', logFile];

    const outcome = await main((_args) =>
    {
      console.log('during-factory');
      return new LoggingOp('during-op');
    });

    if (!outcome.ok)
    {
      throw new Error('Expected main() root op to succeed');
    }

    console.log('after-main', outcome.value);

    const detachedOutcome = await LoggingOp.run('detached-after-main');
    if (!detachedOutcome.ok)
    {
      throw new Error('Expected detached LoggingOp.run() to succeed');
    }

    await waitForIOFlush();

    const logContents = await readFile(logFile, 'utf8');
    assert.match(logContents, /during-factory/);
    assert.match(logContents, /during-op/);
    assert.match(logContents, /after-main during-op/);
    assert.match(logContents, /detached-after-main/);
  }
  finally
  {
    process.argv = savedArgv;
    resetGlobalState();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init.opsMain keeps log routing alive after the root run and across later top-level ops', async () =>
{
  resetGlobalState();

  const tempDir = await mkdtemp(join(tmpdir(), 'init-log-'));
  const logFile = join(tempDir, 'init.log');

  try
  {
    const { opsMain } = init(['--log', logFile]);
    const outcome = await opsMain(new LoggingOp('during-op'));

    if (!outcome.ok)
    {
      throw new Error('Expected init().opsMain root op to succeed');
    }

    console.error('after-opsMain', outcome.value);

    const detachedOutcome = await LoggingOp.run('detached-after-opsMain');
    if (!detachedOutcome.ok)
    {
      throw new Error('Expected detached LoggingOp.run() to succeed');
    }

    await waitForIOFlush();

    const logContents = await readFile(logFile, 'utf8');
    assert.match(logContents, /during-op/);
    assert.match(logContents, /after-opsMain during-op/);
    assert.match(logContents, /detached-after-opsMain/);
  }
  finally
  {
    resetGlobalState();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('match() preserves the active runner so later child ops still use the parent IOContext', async () =>
{
  resetGlobalState();

  const stdoutChunks: string[] = [];
  const mockStdout = new PassThrough();
  mockStdout.setEncoding('utf8');
  mockStdout.on('data', (chunk: string) => stdoutChunks.push(chunk));

  try
  {
    const io = await createIOContext(
      { mode: 'test' },
      { stdout: mockStdout, stderr: new PassThrough() },
    );

    class ParentWithMatchOp extends Op<string, never>
    {
      name = 'ParentWithMatchOp';

      async execute()
      {
        await match(new LoggingOp('child-via-match'), {
          success: () =>
          {},
          failure: () =>
          {
            throw new Error('match() unexpectedly routed to failure');
          },
        });

        const outcome = await LoggingOp.run('after-match');
        if (!outcome.ok)
        {
          throw new Error('Expected follow-up child op to succeed');
        }

        return this.succeed('done');
      }
    }

    const runner = await OpRunner.create(new ParentWithMatchOp(), { mode: 'test' }, io);
    const outcome = await runner.run();

    assert.deepStrictEqual(outcome, { ok: true, value: 'done' });
    assert.ok(stdoutChunks.join('').includes('child-via-match'));
    assert.ok(stdoutChunks.join('').includes('after-match'));
  }
  finally
  {
    resetGlobalState();
  }
});
