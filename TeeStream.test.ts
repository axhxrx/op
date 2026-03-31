import assert from 'node:assert/strict';
import type { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { TeeStream, TeeStreamLogSink } from './TeeStream.ts';

function endTeeStream(stream: TeeStream): Promise<void>
{
  return new Promise<void>((resolve, reject) =>
  {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

function writeChunk(stream: TeeStream, chunk: string): Promise<void>
{
  return new Promise<void>((resolve, reject) =>
  {
    const handleError = (error: Error): void =>
    {
      stream.off('error', handleError);
      reject(error);
    };

    stream.once('error', handleError);
    stream.write(chunk, () =>
    {
      stream.off('error', handleError);
      resolve();
    });
  });
}

function stripTimestampPrefix(line: string): string
{
  return line.replace(/^\[[^\]]+\]\s/, '');
}

class SlowTerminalStream extends Writable
{
  readonly chunks: string[] = [];

  constructor()
  {
    super({ highWaterMark: 1 });
  }

  override _write(
    chunk: Buffer | string,
    _encoding: NodeJS.BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void
  {
    setTimeout(() =>
    {
      this.chunks.push(chunk.toString());
      callback();
    }, 20);
  }
}

test('TeeStreamLogSink.release throws on underflow and closes the sink', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'tee-stream-sink-'));
  const logFile = join(tempDir, 'sink.log');
  const sink = new TeeStreamLogSink(logFile);

  try
  {
    await assert.rejects(sink.release(), /\[TeeStream\] release\(\) called more times than retain\(\)/);

    await assert.rejects(sink.append('late write'), /\[TeeStream\] Cannot write after log sink is closing/);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('TeeStream waits for terminal backpressure before completing writes', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'tee-stream-backpressure-'));
  const logFile = join(tempDir, 'backpressure.log');
  const terminalStream = new SlowTerminalStream();
  const teeStream = new TeeStream(logFile, {}, terminalStream);
  const start = Date.now();

  try
  {
    await writeChunk(teeStream, 'backpressure test\n');

    const durationMs = Date.now() - start;
    assert.ok(durationMs >= 15);
    assert.deepStrictEqual(terminalStream.chunks, ['backpressure test\n']);

    await endTeeStream(teeStream);

    const logLines = (await readFile(logFile, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(stripTimestampPrefix);
    assert.deepStrictEqual(logLines, ['backpressure test']);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('Standalone TeeStreams auto-share an active sink for the same log path', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'tee-stream-shared-'));
  const logFile = join(tempDir, 'shared.log');
  const firstTerminal = new PassThrough();
  const secondTerminal = new PassThrough();
  const firstTeeStream = new TeeStream(logFile, {}, firstTerminal);

  try
  {
    await writeChunk(firstTeeStream, 'first line\n');

    const secondTeeStream = new TeeStream(logFile, {}, secondTerminal);

    try
    {
      await writeChunk(secondTeeStream, 'second line\n');
      await Promise.all([
        endTeeStream(firstTeeStream),
        endTeeStream(secondTeeStream),
      ]);

      const logLines = (await readFile(logFile, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map(stripTimestampPrefix);

      assert.deepStrictEqual(logLines, [
        'first line',
        'second line',
      ]);
    }
    finally
    {
      if (!secondTeeStream.writableEnded)
      {
        await endTeeStream(secondTeeStream);
      }
    }
  }
  finally
  {
    if (!firstTeeStream.writableEnded)
    {
      await endTeeStream(firstTeeStream);
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('TeeStream.createPair routes terminal output separately and serializes log writes', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'tee-stream-'));
  const logFile = join(tempDir, 'tee.log');
  const stdoutTerminal = new PassThrough();
  const stderrTerminal = new PassThrough();
  let stdoutOutput = '';
  let stderrOutput = '';

  stdoutTerminal.setEncoding('utf8');
  stderrTerminal.setEncoding('utf8');
  stdoutTerminal.on('data', (chunk: string) =>
  {
    stdoutOutput += chunk;
  });
  stderrTerminal.on('data', (chunk: string) =>
  {
    stderrOutput += chunk;
  });

  try
  {
    const { stdout, stderr } = TeeStream.createPair(logFile, {
      stdout: stdoutTerminal,
      stderr: stderrTerminal,
    });

    await Promise.all([
      writeChunk(stdout, 'stdout one\n'),
      writeChunk(stderr, 'stderr one\n'),
      writeChunk(stdout, 'stdout two\n'),
      writeChunk(stderr, 'stderr two\n'),
    ]);

    await Promise.all([endTeeStream(stdout), endTeeStream(stderr)]);

    const logLines = (await readFile(logFile, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(stripTimestampPrefix);

    assert.strictEqual(stdoutOutput, 'stdout one\nstdout two\n');
    assert.strictEqual(stderrOutput, 'stderr one\nstderr two\n');
    assert.deepStrictEqual(logLines, [
      'stdout one',
      'stderr one',
      'stdout two',
      'stderr two',
    ]);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('TeeStream with stripAnsi option strips ANSI from log but preserves in terminal', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'tee-stream-strip-'));
  const logFile = join(tempDir, 'strip.log');
  const terminalStream = new PassThrough();
  let terminalOutput = '';
  terminalStream.setEncoding('utf8');
  terminalStream.on('data', (chunk: string) =>
  {
    terminalOutput += chunk;
  });

  const teeStream = new TeeStream(logFile, { stripAnsi: true }, terminalStream);

  try
  {
    const colored = '\x1b[31mRed text\x1b[0m\n';
    await writeChunk(teeStream, colored);
    await endTeeStream(teeStream);

    // Terminal should have ANSI codes
    assert.strictEqual(terminalOutput, colored);

    // Log should have ANSI stripped
    const logLines = (await readFile(logFile, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(stripTimestampPrefix);
    assert.deepStrictEqual(logLines, ['Red text']);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});
