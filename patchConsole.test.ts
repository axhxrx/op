import assert from 'node:assert/strict';
import process from 'node:process';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createDefaultLogger } from './Logger.ts';
import { isConsolePatched, patchConsole, unpatchConsole } from './patchConsole.ts';
import { SharedContext } from './SharedContext.ts';

function createMockIO()
{
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const mockStdout = new PassThrough();
  const mockStderr = new PassThrough();
  mockStdout.setEncoding('utf8');
  mockStderr.setEncoding('utf8');
  mockStdout.on('data', (chunk: string) => stdoutChunks.push(chunk));
  mockStderr.on('data', (chunk: string) => stderrChunks.push(chunk));

  return {
    io: {
      stdin: process.stdin,
      stdout: mockStdout,
      stderr: mockStderr,
      mode: 'test' as const,
      logger: createDefaultLogger(),
    },
    stdoutChunks,
    stderrChunks,
  };
}

test('patchConsole routes console.log to IOContext stdout', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.log('hello world');
    assert.strictEqual(stdoutChunks.join(''), 'hello world\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('patchConsole routes console.warn to IOContext stderr', () =>
{
  const { io, stderrChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.warn('warning!');
    assert.strictEqual(stderrChunks.join(''), 'warning!\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('patchConsole routes console.error to IOContext stderr', () =>
{
  const { io, stderrChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.error('error!');
    assert.strictEqual(stderrChunks.join(''), 'error!\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('patchConsole supports util.format-style formatting', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.log('count: %d, name: %s', 42, 'test');
    assert.strictEqual(stdoutChunks.join(''), 'count: 42, name: test\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('patchConsole handles multiple arguments', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.log('a', 'b', 'c');
    assert.strictEqual(stdoutChunks.join(''), 'a b c\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('unpatchConsole restores original console methods', () =>
{
  const originalLog = console.log;
  patchConsole();
  assert.notStrictEqual(console.log, originalLog);
  unpatchConsole();
  assert.strictEqual(console.log, originalLog);
});

test('patchConsole is idempotent', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    patchConsole(); // second call should be a no-op
    console.log('once');
    assert.strictEqual(stdoutChunks.join(''), 'once\n');
    unpatchConsole();
    assert.strictEqual(isConsolePatched(), false);
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('isConsolePatched reflects current state', () =>
{
  assert.strictEqual(isConsolePatched(), false);
  patchConsole();
  assert.strictEqual(isConsolePatched(), true);
  unpatchConsole();
  assert.strictEqual(isConsolePatched(), false);
});

test('console.info behaves like console.log when patched', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.info('info message');
    assert.strictEqual(stdoutChunks.join(''), 'info message\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('console.debug behaves like console.log when patched', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.debug('debug message');
    assert.strictEqual(stdoutChunks.join(''), 'debug message\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});
