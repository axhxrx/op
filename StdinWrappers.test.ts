import assert from 'node:assert/strict';
import type { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { InputRecording } from './InputRecording.ts';
import { RecordableStdin, type Session } from './RecordableStdin.ts';
import { ReplayableStdin } from './ReplayableStdin.ts';

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 250,
): Promise<void>
{
  const deadline = Date.now() + timeoutMs;

  while (!predicate())
  {
    if (Date.now() > deadline)
    {
      throw new Error('Timed out waiting for condition');
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

function collectReadableChunks(
  stream: RecordableStdin | ReplayableStdin,
  sink: string[],
): void
{
  stream.on('readable', () =>
  {
    let chunk = stream.read();
    while (chunk !== null)
    {
      sink.push(chunk.toString());
      chunk = stream.read();
    }
  });
}

test('RecordableStdin supports both data and readable consumers and detaches listeners', () =>
{
  const source = new PassThrough();
  const first = new RecordableStdin(source);
  const second = new RecordableStdin(source);
  const dataChunks: string[] = [];
  const readableChunks: string[] = [];

  first.on('data', (chunk: Buffer | string) =>
  {
    dataChunks.push(chunk.toString());
  });
  collectReadableChunks(first, readableChunks);

  assert.strictEqual(source.listenerCount('data'), 2);

  source.write('hello');

  assert.deepStrictEqual(dataChunks, ['hello']);
  assert.deepStrictEqual(readableChunks, ['hello']);

  const recording = first.getRecording();
  assert.strictEqual(recording.length, 1);
  assert.strictEqual(typeof recording[0]!.timestamp, 'number');
  assert.strictEqual(recording[0]!.data, 'hello');

  first.destroy();
  assert.strictEqual(source.listenerCount('data'), 1);

  second.destroy();
  assert.strictEqual(source.listenerCount('data'), 0);
});

test('RecordableStdin.saveSession returns the persisted session payload', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'recordable-stdin-'));
  const sessionPath = join(tempDir, 'session.json');
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    source.write('hello');

    const session = await stdin.saveSession(sessionPath);
    const savedSession = JSON.parse(await readFile(sessionPath, 'utf8')) as Session;

    assert.deepStrictEqual(session, savedSession);

    assert.strictEqual(session.events.length, 1);
    assert.strictEqual(typeof session.events[0]!.timestamp, 'number');
    assert.strictEqual(session.events[0]!.data, 'hello');
  }
  finally
  {
    stdin.destroy();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('RecordableStdin skips persisted chunks while InputRecording is disabled', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);
  const dataChunks: string[] = [];

  stdin.on('data', (chunk: Buffer | string) =>
  {
    dataChunks.push(chunk.toString());
  });

  try
  {
    source.write('public-1');

    InputRecording.prohibit();
    source.write('secret');

    InputRecording.removeProhibition();
    source.write('public-2');

    assert.deepStrictEqual(dataChunks, ['public-1', 'secret', 'public-2']);

    const recording = stdin.getRecording();
    assert.strictEqual(recording.length, 2);
    assert.strictEqual(typeof recording[0]!.timestamp, 'number');
    assert.strictEqual(recording[0]!.data, 'public-1');
    assert.strictEqual(typeof recording[1]!.timestamp, 'number');
    assert.strictEqual(recording[1]!.data, 'public-2');
  }
  finally
  {
    while (InputRecording.disabled)
    {
      InputRecording.removeProhibition();
    }
    stdin.destroy();
  }
});

test('ReplayableStdin.setRawMode during replay is buffered and applied on switch to interactive', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-rawmode-'));
  const sessionPath = join(tempDir, 'session.json');
  let rawModeValue: boolean | undefined;
  const source = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(mode: boolean)
    {
      rawModeValue = mode;
    },
  });

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [{ timestamp: 0, data: 'x' }],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    // During replay, setRawMode should be buffered, not applied
    stdin.setRawMode(true);
    assert.strictEqual(rawModeValue, undefined);

    stdin.startReplay(0);
    await waitFor(() => !stdin.isReplayActive());

    // After replay, the buffered raw mode should be applied
    assert.strictEqual(rawModeValue, true);

    stdin.destroy();
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ReplayableStdin does not force raw mode if setRawMode was never called during replay', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-noraw-'));
  const sessionPath = join(tempDir, 'session.json');
  let rawModeSet = false;
  const source = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(_mode: boolean)
    {
      rawModeSet = true;
    },
  });

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [{ timestamp: 0, data: 'x' }],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    // Never call setRawMode during replay
    stdin.startReplay(0);
    await waitFor(() => !stdin.isReplayActive());

    // Raw mode should NOT have been set
    assert.strictEqual(rawModeSet, false);

    stdin.destroy();
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ReplayableStdin emits replayed data to both data and readable consumers and detaches listeners', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-'));
  const sessionPath = join(tempDir, 'session.json');
  const source = new PassThrough();
  const dataChunks: string[] = [];
  const readableChunks: string[] = [];

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [
      { timestamp: 0, data: 'replay' },
    ],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    stdin.on('data', (chunk: Buffer | string) =>
    {
      dataChunks.push(chunk.toString());
    });
    collectReadableChunks(stdin, readableChunks);

    assert.strictEqual(source.listenerCount('data'), 0);

    stdin.startReplay(0);

    await waitFor(() => !stdin.isReplayActive());

    assert.deepStrictEqual(dataChunks, ['replay']);
    assert.deepStrictEqual(readableChunks, ['replay']);
    assert.strictEqual(source.listenerCount('data'), 1);

    source.write('interactive');

    assert.deepStrictEqual(dataChunks, ['replay', 'interactive']);
    assert.deepStrictEqual(readableChunks, ['replay', 'interactive']);

    stdin.destroy();
    assert.strictEqual(source.listenerCount('data'), 0);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// =============================================================================
// BufferedStdin edge cases
// =============================================================================

test('BufferedStdin.read returns null when buffer is empty', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    assert.strictEqual(stdin.read(), null);
  }
  finally
  {
    stdin.destroy();
  }
});

test('BufferedStdin.read with size returns partial data', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    source.write('hello world');

    // Read only 5 bytes
    const chunk = stdin.read(5);
    assert.notStrictEqual(chunk, undefined);
    assert.strictEqual(chunk!.toString(), 'hello');

    // Remaining data should still be available
    const rest = stdin.read();
    assert.notStrictEqual(rest, undefined);
    assert.strictEqual(rest!.toString(), ' world');
  }
  finally
  {
    stdin.destroy();
  }
});

test('BufferedStdin.unshift puts data back at front of buffer', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    source.write('world');

    // Read it
    const chunk = stdin.read();
    assert.strictEqual(chunk!.toString(), 'world');

    // Push it back
    stdin.unshift('hello ');
    stdin.unshift(chunk!);

    // Read both — unshifted items come first
    const first = stdin.read();
    const second = stdin.read();
    assert.strictEqual(first!.toString(), 'world');
    assert.strictEqual(second!.toString(), 'hello ');
  }
  finally
  {
    stdin.destroy();
  }
});

test('BufferedStdin.setEncoding causes read to return strings', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    stdin.setEncoding('utf8');
    source.write('hello');

    const chunk = stdin.read();
    assert.strictEqual(typeof chunk, 'string');
    assert.strictEqual(chunk, 'hello');
  }
  finally
  {
    stdin.destroy();
  }
});

test('BufferedStdin.destroy is idempotent', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  let closeCount = 0;
  stdin.on('close', () => closeCount++);

  stdin.destroy();
  stdin.destroy(); // second destroy should be a no-op

  assert.strictEqual(closeCount, 1);
});

test('BufferedStdin.isTTY delegates to source', () =>
{
  const source = new PassThrough();
  const nonTTY = new RecordableStdin(source);
  assert.strictEqual(nonTTY.isTTY, false);
  nonTTY.destroy();

  const ttySource = Object.assign(new PassThrough(), { isTTY: true });
  const ttyStdin = new RecordableStdin(ttySource);
  assert.strictEqual(ttyStdin.isTTY, true);
  ttyStdin.destroy();
});

// =============================================================================
// RecordableStdin edge cases
// =============================================================================

test('RecordableStdin records multiple events with increasing timestamps', async () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    source.write('a');
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    source.write('b');

    const recording = stdin.getRecording();
    assert.strictEqual(recording.length, 2);
    assert.strictEqual(recording[0]!.data, 'a');
    assert.strictEqual(recording[1]!.data, 'b');
    assert.ok(recording[1]!.timestamp >= recording[0]!.timestamp);
  }
  finally
  {
    stdin.destroy();
  }
});

test('RecordableStdin ignores data after destroy', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  source.write('before');
  stdin.destroy();
  source.write('after');

  assert.strictEqual(stdin.getRecording().length, 1);
  assert.strictEqual(stdin.getRecording()[0]!.data, 'before');
});

test('RecordableStdin.getEventCount matches recording length', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    assert.strictEqual(stdin.getEventCount(), 0);
    source.write('a');
    assert.strictEqual(stdin.getEventCount(), 1);
    source.write('b');
    assert.strictEqual(stdin.getEventCount(), 2);
  }
  finally
  {
    stdin.destroy();
  }
});

test('RecordableStdin.setRawMode on non-TTY source is a no-op', () =>
{
  const source = new PassThrough();
  const stdin = new RecordableStdin(source);

  try
  {
    // Should not throw
    const result = stdin.setRawMode(true);
    assert.strictEqual(result, stdin); // returns this
  }
  finally
  {
    stdin.destroy();
  }
});

// =============================================================================
// ReplayableStdin edge cases
// =============================================================================

test('ReplayableStdin with empty session immediately switches to interactive', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-empty-'));
  const sessionPath = join(tempDir, 'session.json');
  const source = new PassThrough();

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    stdin.startReplay(0);
    await waitFor(() => !stdin.isReplayActive());

    // Should have switched to interactive — source data should flow through
    const chunks: string[] = [];
    stdin.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()));
    source.write('live');

    assert.deepStrictEqual(chunks, ['live']);
    stdin.destroy();
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ReplayableStdin.startReplay when destroyed is a no-op', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-destroyed-'));
  const sessionPath = join(tempDir, 'session.json');
  const source = new PassThrough();

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [{ timestamp: 0, data: 'x' }],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    stdin.destroy();
    // Should not throw or emit data
    stdin.startReplay(0);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    // If we get here without error, the no-op behavior is correct
    assert.strictEqual(stdin.isReplayActive(), true); // still flagged as replaying since switchToInteractive never ran
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('ReplayableStdin.isReplayActive returns false after replay completes', async () =>
{
  const tempDir = await mkdtemp(join(tmpdir(), 'replayable-stdin-active-'));
  const sessionPath = join(tempDir, 'session.json');
  const source = new PassThrough();

  const session: Session = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    events: [{ timestamp: 0, data: 'x' }],
  };

  try
  {
    await writeFile(sessionPath, JSON.stringify(session), 'utf-8');
    const stdin = await ReplayableStdin.create(sessionPath, source);

    assert.strictEqual(stdin.isReplayActive(), true);
    stdin.startReplay(0);
    await waitFor(() => !stdin.isReplayActive());
    assert.strictEqual(stdin.isReplayActive(), false);

    stdin.destroy();
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});
