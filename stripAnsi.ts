/**
 Strip ANSI escape codes from a string

 Removes:
 - Color codes
 - Cursor movement
 - Text formatting (bold, italic, etc.)
 - Other terminal control sequences

 Useful for:
 - Making logs readable in plain text
 - Testing output without worrying about formatting
 - Saving clean logs to files

 @param text - Text that may contain ANSI escape codes
 @returns Clean text without any ANSI codes

 @example
 ```typescript
 const colored = '\u001b[31mRed text\u001b[0m';
 const clean = stripAnsi(colored);
 console.log(clean); // "Red text"
 ```
 */
export function stripAnsi(text: string): string
{
  // ANSI escape code pattern
  // Matches: ESC [ ... m (SGR - Select Graphic Rendition)
  //          ESC [ ... (various cursor and display commands)
  //          ESC ] ... (Operating System Command)
  //          Other escape sequences
  // eslint-disable-next-line no-control-regex
  const ansiPattern = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\x1b[()][AB0-2]/g;

  return text.replace(ansiPattern, '');
}

/**
 Strip ANSI codes from multiple lines

 @param lines - Array of lines that may contain ANSI codes
 @returns Array of clean lines
 */
export function stripAnsiFromLines(lines: string[]): string[]
{
  return lines.map(line => stripAnsi(line));
}

/**
 Check if a string contains ANSI escape codes

 @param text - Text to check
 @returns true if text contains ANSI codes
 */
export function hasAnsi(text: string): boolean
{
  // eslint-disable-next-line no-control-regex
  const ansiPattern = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\x1b[()][AB0-2]/;
  return ansiPattern.test(text);
}
