import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createIOContext } from './IOContext.ts';
import { RecordableStdin } from './RecordableStdin.ts';
import { TeeStream } from './TeeStream.ts';

test('createIOContext in test mode without logFile returns plain streams', async () =>
{
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const io = await createIOContext({ mode: 'test' }, { stdout, stderr });

  assert.strictEqual(io.mode, 'test');
  assert.strictEqual(io.stdout, stdout);
  assert.strictEqual(io.stderr, stderr);
  assert.strictEqual(io.recordableStdin, undefined);
  assert.strictEqual(io.replayableStdin, undefined);
});

test('createIOContext in record mode creates RecordableStdin', async () =>
{
  const source = new PassThrough();
  const io = await createIOContext(
    { mode: 'record', sessionFile: 'test.json' },
    { stdin: source, stdout: new PassThrough(), stderr: new PassThrough() },
  );

  try
  {
    assert.strictEqual(io.mode, 'record');
    assert.ok(io.recordableStdin instanceof RecordableStdin);
    assert.notStrictEqual(io.recordableStdin, undefined);
    assert.strictEqual(io.stdin, io.recordableStdin!);
  }
  finally
  {
    io.recordableStdin?.destroy();
  }
});

test('createIOContext in replay mode without sessionFile throws', async () =>
{
  await assert.rejects(
    createIOContext({ mode: 'replay' }, { stdout: new PassThrough(), stderr: new PassThrough() }),
    /--replay requires a session file/,
  );
});

test('createIOContext with logFile creates TeeStream stdout/stderr', async () =>
{
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const tempDir = await mkdtemp(join(tmpdir(), 'iocontext-'));
  const logFile = join(tempDir, 'test.log');

  try
  {
    const io = await createIOContext(
      { mode: 'test', logFile },
      { stdout: new PassThrough(), stderr: new PassThrough() },
    );

    assert.ok(io.stdout instanceof TeeStream);
    assert.ok(io.stderr instanceof TeeStream);

    // Clean up TeeStreams
    const stdout = io.stdout as TeeStream;
    const stderr = io.stderr as TeeStream;
    await new Promise<void>((resolve) => stdout.end(resolve));
    await new Promise<void>((resolve) => stderr.end(resolve));
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('createIOContext logger routes log to stdout and warn/error to stderr', async () =>
{
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let stdoutData = '';
  let stderrData = '';
  stdout.setEncoding('utf8');
  stderr.setEncoding('utf8');
  stdout.on('data', (chunk: string) => stdoutData += chunk);
  stderr.on('data', (chunk: string) => stderrData += chunk);

  const io = await createIOContext({ mode: 'test' }, { stdout, stderr });

  io.logger.log('info');
  io.logger.warn('warning');
  io.logger.error('problem');

  assert.ok(stdoutData.includes('info'));
  assert.ok(!stdoutData.includes('warning'));
  assert.ok(stderrData.includes('warning'));
  assert.ok(stderrData.includes('problem'));
  assert.ok(!stderrData.includes('info'));
});
