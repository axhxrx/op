import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefaultLogger, Logger } from './Logger.ts';

test('Logger.log/warn/error call the correct writers', () =>
{
  const calls: Array<{ level: string; message: string }> = [];
  const logger = new Logger({
    logWriter: (msg) => calls.push({ level: 'log', message: msg }),
    warnWriter: (msg) => calls.push({ level: 'warn', message: msg }),
    errorWriter: (msg) => calls.push({ level: 'error', message: msg }),
  });

  logger.log('info message');
  logger.warn('warn message');
  logger.error('error message');

  assert.deepStrictEqual(calls, [
    { level: 'log', message: 'info message' },
    { level: 'warn', message: 'warn message' },
    { level: 'error', message: 'error message' },
  ]);
});

test('Logger with namespace adds prefix', () =>
{
  const messages: string[] = [];
  const logger = new Logger({
    namespace: 'MyApp',
    logWriter: (msg) => messages.push(msg),
  });

  logger.log('hello');
  assert.deepStrictEqual(messages, ['[MyApp] hello']);
});

test('Logger without namespace has no prefix', () =>
{
  const messages: string[] = [];
  const logger = new Logger({
    logWriter: (msg) => messages.push(msg),
  });

  logger.log('hello');
  assert.deepStrictEqual(messages, ['hello']);
});

test('Logger.child creates hierarchical namespace', () =>
{
  const messages: string[] = [];
  const parent = new Logger({
    namespace: 'App',
    logWriter: (msg) => messages.push(msg),
  });
  const child = parent.child('Database');

  parent.log('starting');
  child.log('connected');

  assert.deepStrictEqual(messages, [
    '[App] starting',
    '[App:Database] connected',
  ]);
});

test('Logger.child from root uses sub-namespace directly', () =>
{
  const messages: string[] = [];
  const root = new Logger({
    logWriter: (msg) => messages.push(msg),
  });
  const child = root.child('Sub');

  child.log('test');
  assert.deepStrictEqual(messages, ['[Sub] test']);
});

test('Logger.child inherits writers', () =>
{
  const warns: string[] = [];
  const parent = new Logger({
    namespace: 'Parent',
    warnWriter: (msg) => warns.push(msg),
  });
  const child = parent.child('Child');

  child.warn('oops');
  assert.deepStrictEqual(warns, ['[Parent:Child] oops']);
});

test('Logger.getNamespace returns the namespace', () =>
{
  const withNs = new Logger({ namespace: 'Test' });
  const withoutNs = new Logger({});

  assert.strictEqual(withNs.getNamespace(), 'Test');
  assert.strictEqual(withoutNs.getNamespace(), undefined);
});

test('createDefaultLogger returns a Logger with no namespace', () =>
{
  const logger = createDefaultLogger();
  assert.ok(logger instanceof Logger);
  assert.strictEqual(logger.getNamespace(), undefined);
});
