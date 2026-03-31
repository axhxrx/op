import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createIOContext } from './IOContext.ts';
import { RecordableStdin } from './RecordableStdin.ts';
import { TeeStream } from './TeeStream.ts';

test('createIOContext in test mode without logFile returns plain streams', async () =>
{
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const io = await createIOContext({ mode: 'test' }, { stdout, stderr });

  expect(io.mode).toBe('test');
  expect(io.stdout).toBe(stdout);
  expect(io.stderr).toBe(stderr);
  expect(io.recordableStdin).toBeUndefined();
  expect(io.replayableStdin).toBeUndefined();
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
    expect(io.mode).toBe('record');
    expect(io.recordableStdin).toBeInstanceOf(RecordableStdin);
    expect(io.recordableStdin).toBeDefined();
    expect(io.stdin).toBe(io.recordableStdin!);
  }
  finally
  {
    io.recordableStdin?.destroy();
  }
});

test('createIOContext in replay mode without sessionFile throws', async () =>
{
  await expect(
    createIOContext({ mode: 'replay' }, { stdout: new PassThrough(), stderr: new PassThrough() }),
  ).rejects.toThrow('--replay requires a session file');
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

    expect(io.stdout).toBeInstanceOf(TeeStream);
    expect(io.stderr).toBeInstanceOf(TeeStream);

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

  expect(stdoutData).toContain('info');
  expect(stdoutData).not.toContain('warning');
  expect(stderrData).toContain('warning');
  expect(stderrData).toContain('problem');
  expect(stderrData).not.toContain('info');
});
