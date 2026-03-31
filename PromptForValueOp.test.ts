import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { InputRecording } from './InputRecording.ts';
import { createIOContext } from './IOContext.ts';
import { PromptForPasswordOp } from './PromptForPasswordOp.ts';
import { PromptForValueOp } from './PromptForValueOp.ts';
import { RecordableStdin } from './RecordableStdin.ts';
import { SharedContext } from './SharedContext.ts';

function cleanup(): void
{
  SharedContext.overrideDefaultIOContext = null;
  while (InputRecording.disabled)
  {
    InputRecording.removeProhibition();
  }
}

class FakeTTYStream extends PassThrough
{
  isTTY = true;
  isRaw = true;

  setRawMode(mode: boolean): void
  {
    this.isRaw = mode;
  }
}

async function createTestIO(source: PassThrough)
{
  const stdout = new PassThrough();
  stdout.setEncoding('utf8');
  const result = await createIOContext({ mode: 'test' }, { stdin: source, stdout, stderr: new PassThrough() });
  SharedContext.overrideDefaultIOContext = result;
  return result;
}

test('PromptForValueOp succeeds with trimmed user input', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForValueOp('Name: ');
    const runPromise = op.run();

    source.write('Alice\n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: 'Alice' });
  }
  finally
  {
    cleanup();
  }
});

test('PromptForValueOp trims whitespace from input', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForValueOp();
    const runPromise = op.run();

    source.write('  spaced  \n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: 'spaced' });
  }
  finally
  {
    cleanup();
  }
});

test('PromptForValueOp writes prompt to stdout', async () =>
{
  try
  {
    const source = new PassThrough();
    const io = await createTestIO(source);
    let stdoutData = '';
    (io.stdout as PassThrough).on('data', (chunk: string) => stdoutData += chunk);

    const op = new PromptForValueOp('Enter value: ');
    const runPromise = op.run();

    source.write('x\n');
    await runPromise;

    assert.ok(stdoutData.includes('Enter value: '));
  }
  finally
  {
    cleanup();
  }
});

test('PromptForValueOp returns canceled on EOF', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForValueOp();
    const runPromise = op.run();

    source.end();
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: false, failure: 'canceled' });
  }
  finally
  {
    cleanup();
  }
});

test('PromptForValueOp succeeds with empty input', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForValueOp();
    const runPromise = op.run();

    source.write('\n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: '' });
  }
  finally
  {
    cleanup();
  }
});

test('PromptForPasswordOp disables InputRecording during input', async () =>
{
  const source = new PassThrough();
  const recordableStdin = new RecordableStdin(source);
  const stdout = new PassThrough();
  stdout.setEncoding('utf8');
  const io = await createIOContext({ mode: 'record', sessionFile: 'test.json' }, {
    stdin: source,
    stdout,
    stderr: new PassThrough(),
  });

  // Replace the io's stdin with our source for the readline to work,
  // but keep the recordableStdin reference
  const testIO = { ...io, stdin: source, recordableStdin };
  SharedContext.overrideDefaultIOContext = testIO;

  try
  {
    const op = new PromptForPasswordOp('Token: ');
    // Call execute() directly to test internal InputRecording behavior
    // without the async gap introduced by OpRunner scaffolding in run()
    const runPromise = op.execute();

    // Write the password while InputRecording should be disabled
    source.write('secret123\n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: 'secret123' });

    // The password should NOT appear in the recording
    const recording = recordableStdin.getRecording();
    const hasSecret = recording.some(e => e.data.includes('secret123'));
    assert.strictEqual(hasSecret, false);

    // InputRecording should have removed only the prohibition it added
    assert.strictEqual(InputRecording.disabled, false);
  }
  finally
  {
    recordableStdin.destroy();
    io.recordableStdin?.destroy();
    cleanup();
  }
});

test('PromptForPasswordOp re-enables InputRecording even on EOF', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForPasswordOp();
    const runPromise = op.execute();

    source.end();
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: false, failure: 'canceled' });
    assert.strictEqual(InputRecording.disabled, false);
  }
  finally
  {
    cleanup();
  }
});

test('PromptForPasswordOp preserves surrounding whitespace in non-raw mode', async () =>
{
  try
  {
    const source = new PassThrough();
    await createTestIO(source);

    const op = new PromptForPasswordOp();
    const runPromise = op.execute();

    source.write('  secret123  \n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: '  secret123  ' });
  }
  finally
  {
    cleanup();
  }
});

test('PromptForPasswordOp preserves outer InputRecording prohibitions', async () =>
{
  const source = new PassThrough();
  await createTestIO(source);
  InputRecording.prohibit();

  try
  {
    const op = new PromptForPasswordOp();
    const runPromise = op.execute();

    source.write('secret123\n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: 'secret123' });
    assert.strictEqual(InputRecording.disabled, true);
  }
  finally
  {
    InputRecording.removeProhibition();
    cleanup();
  }
});

test('PromptForPasswordOp restores prior raw mode when stdin is wrapped', async () =>
{
  const source = new FakeTTYStream();
  const io = await createIOContext({ mode: 'record', sessionFile: 'test.json' }, {
    stdin: source,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  SharedContext.overrideDefaultIOContext = io;

  try
  {
    const op = new PromptForPasswordOp('Token: ');
    const runPromise = op.execute();

    source.write('  secret123  \n');
    const outcome = await runPromise;

    assert.deepStrictEqual(outcome, { ok: true, value: '  secret123  ' });
    assert.strictEqual(source.isRaw, true);
  }
  finally
  {
    io.recordableStdin?.destroy();
    cleanup();
  }
});
