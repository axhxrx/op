import { expect, test } from 'bun:test';
import type { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
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

  expect(source.listenerCount('data')).toBe(2);

  source.write('hello');

  expect(dataChunks).toEqual(['hello']);
  expect(readableChunks).toEqual(['hello']);
  expect(first.getRecording()).toEqual([
    {
      timestamp: expect.any(Number),
      data: 'hello',
    },
  ]);

  first.destroy();
  expect(source.listenerCount('data')).toBe(1);

  second.destroy();
  expect(source.listenerCount('data')).toBe(0);
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

    expect(session).toEqual(savedSession);
    expect(session.events).toEqual([
      {
        timestamp: expect.any(Number),
        data: 'hello',
      },
    ]);
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

    InputRecording.disabled = true;
    source.write('secret');

    InputRecording.disabled = false;
    source.write('public-2');

    expect(dataChunks).toEqual(['public-1', 'secret', 'public-2']);
    expect(stdin.getRecording()).toEqual([
      {
        timestamp: expect.any(Number),
        data: 'public-1',
      },
      {
        timestamp: expect.any(Number),
        data: 'public-2',
      },
    ]);
  }
  finally
  {
    InputRecording.disabled = false;
    stdin.destroy();
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

    expect(source.listenerCount('data')).toBe(0);

    stdin.startReplay(0);

    await waitFor(() => !stdin.isReplayActive());

    expect(dataChunks).toEqual(['replay']);
    expect(readableChunks).toEqual(['replay']);
    expect(source.listenerCount('data')).toBe(1);

    source.write('interactive');

    expect(dataChunks).toEqual(['replay', 'interactive']);
    expect(readableChunks).toEqual(['replay', 'interactive']);

    stdin.destroy();
    expect(source.listenerCount('data')).toBe(0);
  }
  finally
  {
    await rm(tempDir, { recursive: true, force: true });
  }
});
