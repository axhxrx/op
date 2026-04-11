import assert from 'node:assert/strict';
import { mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ExecOp } from './ExecOp.ts';
import { StripAnsiOp } from './StripAnsiOp.ts';

const SCRIPT = join(import.meta.dirname!, 'StripAnsiOp.ts');

/**
 Helper: run the StripAnsiOp CLI as a subprocess via ExecOp. Returns `{ exitCode, stdout, stderr }`.
 */
async function runCLI(...args: string[]): Promise<{ exitCode: number | null; stdout: string; stderr: string }>
{
  const outcome = await new ExecOp([SCRIPT, ...args]).run();
  assert.ok(outcome.ok, `ExecOp itself should not fail: ${!outcome.ok ? outcome.failure : ''}`);
  return outcome.value;
}

/**
 Helper: create a temp file with given content, returning its path.
 */
function tmpFile(content: string, name = 'test-input.txt'): string
{
  const dir = mkdtempSync(join(tmpdir(), 'strip-ansi-op-test-'));
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

// ── Unit tests for the Op class itself ──────────────────────────────────────

test('StripAnsiOp strips ANSI codes from a string', async () =>
{
  const outcome = await StripAnsiOp.run('\x1b[31mRed\x1b[0m \x1b[1;32mBold Green\x1b[0m plain');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'Red Bold Green plain');
});

test('StripAnsiOp passes through clean strings unchanged', async () =>
{
  const outcome = await StripAnsiOp.run('No ANSI here');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'No ANSI here');
});

test('StripAnsiOp handles empty string', async () =>
{
  const outcome = await StripAnsiOp.run('');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, '');
});

test('StripAnsiOp strips ANSI from string[]', async () =>
{
  const outcome = await StripAnsiOp.run([
    '\x1b[31mRed\x1b[0m',
    '\x1b[32mGreen\x1b[0m',
    'Plain',
  ]);
  assert.ok(outcome.ok);
  assert.deepStrictEqual(outcome.value, ['Red', 'Green', 'Plain']);
});

test('StripAnsiOp handles empty string[]', async () =>
{
  const outcome = await StripAnsiOp.run([]);
  assert.ok(outcome.ok);
  assert.deepStrictEqual(outcome.value, []);
});

test('StripAnsiOp.hasAnsi detects ANSI codes', () =>
{
  assert.strictEqual(StripAnsiOp.hasAnsi('\x1b[31mRed\x1b[0m'), true);
  assert.strictEqual(StripAnsiOp.hasAnsi('Plain text'), false);
  assert.strictEqual(StripAnsiOp.hasAnsi(''), false);
});

test('StripAnsiOp.strip synchronously strips ANSI', () =>
{
  assert.strictEqual(StripAnsiOp.strip('\x1b[31mRed\x1b[0m'), 'Red');
  assert.strictEqual(StripAnsiOp.strip('Plain'), 'Plain');
});

// ── CLI end-to-end tests ────────────────────────────────────────────────────

test('CLI: --help prints usage and exits 0', async () =>
{
  const result = await runCLI('--help');
  assert.strictEqual(result.exitCode, 0);
  assert.ok(result.stdout.includes('Usage: StripAnsiOp.ts <file>'));
  assert.ok(result.stdout.includes('Examples:'));
});

test('CLI: -h prints usage and exits 0', async () =>
{
  const result = await runCLI('-h');
  assert.strictEqual(result.exitCode, 0);
  assert.ok(result.stdout.includes('Usage: StripAnsiOp.ts <file>'));
});

test('CLI: no args prints error and usage to stderr, exits 1', async () =>
{
  const result = await runCLI();
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stderr.includes('Expected exactly one file argument, got 0'));
  assert.ok(result.stderr.includes('Usage:'));
});

test('CLI: too many args prints error and usage to stderr, exits 1', async () =>
{
  const result = await runCLI('file1.txt', 'file2.txt');
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stderr.includes('Expected exactly one file argument, got 2'));
  assert.ok(result.stderr.includes('Usage:'));
});

test('CLI: unknown flag prints error and usage to stderr, exits 1', async () =>
{
  const result = await runCLI('--bogus');
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stderr.includes('Usage:'));
});

test('CLI: nonexistent file prints error to stderr, exits 1', async () =>
{
  const result = await runCLI('/tmp/definitely-does-not-exist-strip-ansi-test.txt');
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stderr.includes('File not found'));
});

test('CLI: strips ANSI from file and writes clean text to stdout', async () =>
{
  const content = '\x1b[31mRed text\x1b[0m and \x1b[1;34mbold blue\x1b[0m and plain';
  const filePath = tmpFile(content);

  try
  {
    const result = await runCLI(filePath);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, 'Red text and bold blue and plain');
    assert.strictEqual(result.stderr, '');
  }
  finally
  {
    unlinkSync(filePath);
  }
});

test('CLI: file with no ANSI passes through unchanged', async () =>
{
  const content = 'Just plain text\nWith multiple lines\n';
  const filePath = tmpFile(content);

  try
  {
    const result = await runCLI(filePath);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, content);
    assert.strictEqual(result.stderr, '');
  }
  finally
  {
    unlinkSync(filePath);
  }
});

test('CLI: empty file produces empty stdout', async () =>
{
  const filePath = tmpFile('');

  try
  {
    const result = await runCLI(filePath);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  }
  finally
  {
    unlinkSync(filePath);
  }
});

test('CLI: preserves multiline structure after stripping', async () =>
{
  const lines = [
    '\x1b[32m✓\x1b[0m Test 1 passed',
    '\x1b[31m✗\x1b[0m Test 2 failed',
    '\x1b[33m⚠\x1b[0m Test 3 skipped',
    '',
  ].join('\n');
  const filePath = tmpFile(lines);

  try
  {
    const result = await runCLI(filePath);
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '✓ Test 1 passed\n✗ Test 2 failed\n⚠ Test 3 skipped\n');
  }
  finally
  {
    unlinkSync(filePath);
  }
});
