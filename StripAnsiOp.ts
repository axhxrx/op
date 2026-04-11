#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { hasAnsi } from './hasAnsi.ts';
import { Op } from './Op.ts';
import type { Failure, Success } from './Outcome.ts';
import { stripAnsi } from './stripAnsi.ts';

type StripAnsiOpOutcome = Success<string | string[]> | Failure<'unknownError'>;

/**
 StripAnsiOp — removes ANSI escape codes from a string or array of strings.

 When constructed with a `string`, the success value is a `string`. When constructed with a `string[]`, the success value is a `string[]` with each element stripped independently.

 Also exposes a static `hasAnsi()` check for testing whether a string contains ANSI codes.

 Example:
 ```ts
 const outcome = await StripAnsiOp.run('\x1b[31mRed text\x1b[0m')
 if (outcome.ok) console.log(outcome.value) // "Red text"

 const outcome2 = await StripAnsiOp.run(['\x1b[31mRed\x1b[0m', '\x1b[32mGreen\x1b[0m'])
 if (outcome2.ok) console.log(outcome2.value) // ["Red", "Green"]

 StripAnsiOp.hasAnsi('\x1b[31mRed\x1b[0m') // true
 StripAnsiOp.hasAnsi('plain') // false
 ```
 */
export class StripAnsiOp extends Op<string | string[], 'unknownError'>
{
  private input: string | string[];

  constructor(input: string | string[])
  {
    super();
    this.input = input;
  }

  get name(): string
  {
    return 'StripAnsiOp';
  }

  /**
   Check if a string contains ANSI escape codes.
   */
  static hasAnsi(text: string): boolean
  {
    return hasAnsi(text);
  }

  /**
   Strip ANSI escape codes from a single string. This is the synchronous core used internally by `execute()` and by other framework code (e.g. TeeStream) that needs direct access without going through the Op lifecycle.
   */
  static strip(text: string): string
  {
    return stripAnsi(text);
  }

  async execute(): Promise<StripAnsiOpOutcome>
  {
    await Promise.resolve();
    try
    {
      if (Array.isArray(this.input))
      {
        return this.succeed(this.input.map(line => StripAnsiOp.strip(line)));
      }
      return this.succeed(StripAnsiOp.strip(this.input));
    }
    catch (error: unknown)
    {
      return this.failWithUnknownError(String(error));
    }
  }
}

const USAGE = `Usage: StripAnsiOp.ts <file>

Strip ANSI escape codes from a file and write clean text to stdout.

Examples:
  bun StripAnsiOp.ts build.log
  bun StripAnsiOp.ts build.log > clean.log
  deno run -A StripAnsiOp.ts colored.txt > plain.txt`;

if (import.meta.main)
{
  let positionals: string[];
  let help = false;

  try
  {
    const parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
      },
    });
    positionals = parsed.positionals;
    help = parsed.values.help ?? false;
  }
  catch (error: unknown)
  {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(USAGE);
    process.exit(1);
  }

  if (help)
  {
    console.log(USAGE);
    process.exit(0);
  }

  if (positionals.length !== 1)
  {
    console.error(`Error: Expected exactly one file argument, got ${positionals.length}.\n`);
    console.error(USAGE);
    process.exit(1);
  }

  const filePath = positionals[0]!;
  let contents: string;

  try
  {
    contents = await readFile(filePath, 'utf-8');
  }
  catch (error: unknown)
  {
    const msg = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? `File not found: ${filePath}`
      : `Failed to read file: ${filePath} — ${error instanceof Error ? error.message : String(error)}`;
    console.error(`Error: ${msg}`);
    process.exit(1);
  }

  const outcome = await StripAnsiOp.run(contents);

  if (outcome.ok)
  {
    process.stdout.write(outcome.value as string);
  }
  else
  {
    console.error(`Error: StripAnsiOp failed — ${outcome.failure}`);
    process.exit(1);
  }
}
