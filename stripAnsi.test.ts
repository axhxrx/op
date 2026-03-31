import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasAnsi, stripAnsi, stripAnsiFromLines } from './stripAnsi.ts';

test('stripAnsi removes color codes', () =>
{
  const colored = '\u001b[31mRed text\u001b[0m';
  const clean = stripAnsi(colored);
  assert.strictEqual(clean, 'Red text');
});

test('stripAnsi removes bold/italic formatting', () =>
{
  const formatted = '\u001b[1mBold\u001b[0m \u001b[3mItalic\u001b[0m';
  const clean = stripAnsi(formatted);
  assert.strictEqual(clean, 'Bold Italic');
});

test('stripAnsi removes cursor movement codes', () =>
{
  const withCursor = 'Text\u001b[2AMore text';
  const clean = stripAnsi(withCursor);
  assert.strictEqual(clean, 'TextMore text');
});

test('stripAnsi handles text with no ANSI codes', () =>
{
  const plain = 'Just plain text';
  const clean = stripAnsi(plain);
  assert.strictEqual(clean, 'Just plain text');
});

test('stripAnsi handles empty string', () =>
{
  const clean = stripAnsi('');
  assert.strictEqual(clean, '');
});

test('stripAnsi handles complex terminal output', () =>
{
  // Terminal output with cursor and colors
  const terminalOutput = '\u001b[36m❯\u001b[39m Option 1\n  Option 2\n  Option 3';
  const clean = stripAnsi(terminalOutput);
  assert.strictEqual(clean, '❯ Option 1\n  Option 2\n  Option 3');
});

test('stripAnsiFromLines processes multiple lines', () =>
{
  const lines = [
    '\u001b[31mLine 1\u001b[0m',
    '\u001b[32mLine 2\u001b[0m',
    'Plain line 3',
  ];
  const clean = stripAnsiFromLines(lines);
  assert.deepStrictEqual(clean, [
    'Line 1',
    'Line 2',
    'Plain line 3',
  ]);
});

test('hasAnsi detects ANSI codes', () =>
{
  assert.strictEqual(hasAnsi('\u001b[31mRed\u001b[0m'), true);
  assert.strictEqual(hasAnsi('Plain text'), false);
  assert.strictEqual(hasAnsi(''), false);
  assert.strictEqual(hasAnsi('\u001b[2AUp'), true);
});

test('stripAnsi preserves emoji and unicode', () =>
{
  const withEmoji = '\u001b[31m🎉 Success!\u001b[0m 👍';
  const clean = stripAnsi(withEmoji);
  assert.strictEqual(clean, '🎉 Success! 👍');
});

test('stripAnsi removes cursor show/hide (private CSI with ? prefix)', () =>
{
  const showCursor = '\x1b[?25h';
  const hideCursor = '\x1b[?25l';
  assert.strictEqual(stripAnsi(`before${hideCursor}after`), 'beforeafter');
  assert.strictEqual(stripAnsi(`before${showCursor}after`), 'beforeafter');
  assert.strictEqual(hasAnsi(showCursor), true);
  assert.strictEqual(hasAnsi(hideCursor), true);
});

test('stripAnsi removes alternate screen and bracketed paste sequences', () =>
{
  const altScreenOn = '\x1b[?1049h';
  const altScreenOff = '\x1b[?1049l';
  const bracketedPasteOn = '\x1b[?2004h';
  const bracketedPasteOff = '\x1b[?2004l';
  const input = `${altScreenOn}content${bracketedPasteOn}pasted${bracketedPasteOff}more${altScreenOff}`;
  assert.strictEqual(stripAnsi(input), 'contentpastedmore');
});
