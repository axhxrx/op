import { expect, test } from 'bun:test';
import { hasAnsi, stripAnsi, stripAnsiFromLines } from './stripAnsi.ts';

test('stripAnsi removes color codes', () =>
{
  const colored = '\u001b[31mRed text\u001b[0m';
  const clean = stripAnsi(colored);
  expect(clean).toBe('Red text');
});

test('stripAnsi removes bold/italic formatting', () =>
{
  const formatted = '\u001b[1mBold\u001b[0m \u001b[3mItalic\u001b[0m';
  const clean = stripAnsi(formatted);
  expect(clean).toBe('Bold Italic');
});

test('stripAnsi removes cursor movement codes', () =>
{
  const withCursor = 'Text\u001b[2AMore text';
  const clean = stripAnsi(withCursor);
  expect(clean).toBe('TextMore text');
});

test('stripAnsi handles text with no ANSI codes', () =>
{
  const plain = 'Just plain text';
  const clean = stripAnsi(plain);
  expect(clean).toBe('Just plain text');
});

test('stripAnsi handles empty string', () =>
{
  const clean = stripAnsi('');
  expect(clean).toBe('');
});

test('stripAnsi handles complex Ink output', () =>
{
  // Typical Ink SelectInput output with cursor and colors
  const inkOutput = '\u001b[36m❯\u001b[39m Option 1\n  Option 2\n  Option 3';
  const clean = stripAnsi(inkOutput);
  expect(clean).toBe('❯ Option 1\n  Option 2\n  Option 3');
});

test('stripAnsiFromLines processes multiple lines', () =>
{
  const lines = [
    '\u001b[31mLine 1\u001b[0m',
    '\u001b[32mLine 2\u001b[0m',
    'Plain line 3',
  ];
  const clean = stripAnsiFromLines(lines);
  expect(clean).toEqual([
    'Line 1',
    'Line 2',
    'Plain line 3',
  ]);
});

test('hasAnsi detects ANSI codes', () =>
{
  expect(hasAnsi('\u001b[31mRed\u001b[0m')).toBe(true);
  expect(hasAnsi('Plain text')).toBe(false);
  expect(hasAnsi('')).toBe(false);
  expect(hasAnsi('\u001b[2AUp')).toBe(true);
});

test('stripAnsi preserves emoji and unicode', () =>
{
  const withEmoji = '\u001b[31m🎉 Success!\u001b[0m 👍';
  const clean = stripAnsi(withEmoji);
  expect(clean).toBe('🎉 Success! 👍');
});
