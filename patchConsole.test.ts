import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
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
    expect(stdoutChunks.join('')).toBe('hello world\n');
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
    expect(stderrChunks.join('')).toBe('warning!\n');
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
    expect(stderrChunks.join('')).toBe('error!\n');
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
    expect(stdoutChunks.join('')).toBe('count: 42, name: test\n');
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
    expect(stdoutChunks.join('')).toBe('a b c\n');
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
  expect(console.log).not.toBe(originalLog);
  unpatchConsole();
  expect(console.log).toBe(originalLog);
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
    expect(stdoutChunks.join('')).toBe('once\n');
    unpatchConsole();
    expect(isConsolePatched()).toBe(false);
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});

test('isConsolePatched reflects current state', () =>
{
  expect(isConsolePatched()).toBe(false);
  patchConsole();
  expect(isConsolePatched()).toBe(true);
  unpatchConsole();
  expect(isConsolePatched()).toBe(false);
});

test('console.info behaves like console.log when patched', () =>
{
  const { io, stdoutChunks } = createMockIO();
  SharedContext.overrideDefaultIOContext = io;
  try
  {
    patchConsole();
    console.info('info message');
    expect(stdoutChunks.join('')).toBe('info message\n');
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
    expect(stdoutChunks.join('')).toBe('debug message\n');
  }
  finally
  {
    unpatchConsole();
    SharedContext.overrideDefaultIOContext = null;
  }
});
