import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StripAnsiOp } from './StripAnsiOp.ts';

test('StripAnsiOp removes color codes', async () =>
{
  const outcome = await StripAnsiOp.run('\u001b[31mRed text\u001b[0m');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'Red text');
});

test('StripAnsiOp removes bold/italic formatting', async () =>
{
  const outcome = await StripAnsiOp.run('\u001b[1mBold\u001b[0m \u001b[3mItalic\u001b[0m');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'Bold Italic');
});

test('StripAnsiOp removes cursor movement codes', async () =>
{
  const outcome = await StripAnsiOp.run('Text\u001b[2AMore text');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'TextMore text');
});

test('StripAnsiOp handles text with no ANSI codes', async () =>
{
  const outcome = await StripAnsiOp.run('Just plain text');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'Just plain text');
});

test('StripAnsiOp handles empty string', async () =>
{
  const outcome = await StripAnsiOp.run('');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, '');
});

test('StripAnsiOp handles complex terminal output', async () =>
{
  const outcome = await StripAnsiOp.run('\u001b[36m❯\u001b[39m Option 1\n  Option 2\n  Option 3');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, '❯ Option 1\n  Option 2\n  Option 3');
});

test('StripAnsiOp processes multiple lines via string[]', async () =>
{
  const outcome = await StripAnsiOp.run([
    '\u001b[31mLine 1\u001b[0m',
    '\u001b[32mLine 2\u001b[0m',
    'Plain line 3',
  ]);
  assert.ok(outcome.ok);
  assert.deepStrictEqual(outcome.value, [
    'Line 1',
    'Line 2',
    'Plain line 3',
  ]);
});

test('StripAnsiOp.hasAnsi detects ANSI codes', () =>
{
  assert.strictEqual(StripAnsiOp.hasAnsi('\u001b[31mRed\u001b[0m'), true);
  assert.strictEqual(StripAnsiOp.hasAnsi('Plain text'), false);
  assert.strictEqual(StripAnsiOp.hasAnsi(''), false);
  assert.strictEqual(StripAnsiOp.hasAnsi('\u001b[2AUp'), true);
});

test('StripAnsiOp preserves emoji and unicode', async () =>
{
  const outcome = await StripAnsiOp.run('\u001b[31m🎉 Success!\u001b[0m 👍');
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, '🎉 Success! 👍');
});

test('StripAnsiOp removes cursor show/hide (private CSI with ? prefix)', async () =>
{
  const outcome1 = await StripAnsiOp.run(`before\x1b[?25lafter`);
  assert.ok(outcome1.ok);
  assert.strictEqual(outcome1.value, 'beforeafter');

  const outcome2 = await StripAnsiOp.run(`before\x1b[?25hafter`);
  assert.ok(outcome2.ok);
  assert.strictEqual(outcome2.value, 'beforeafter');

  assert.strictEqual(StripAnsiOp.hasAnsi('\x1b[?25h'), true);
  assert.strictEqual(StripAnsiOp.hasAnsi('\x1b[?25l'), true);
});

test('StripAnsiOp removes alternate screen and bracketed paste sequences', async () =>
{
  const input = `\x1b[?1049hcontent\x1b[?2004hpasted\x1b[?2004lmore\x1b[?1049l`;
  const outcome = await StripAnsiOp.run(input);
  assert.ok(outcome.ok);
  assert.strictEqual(outcome.value, 'contentpastedmore');
});
