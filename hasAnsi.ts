/**
 Check if a string contains ANSI escape codes. This is a pure function, so it is reasonable to import and invoke inside an Op.
 */
export function hasAnsi(text: string): boolean
{
  // deno-lint-ignore no-control-regex
  const ANSI_PATTERN = /\x1b\[[?!>]?[0-9;:]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\x1b[()][AB0-2]/;

  return ANSI_PATTERN.test(text);
}
