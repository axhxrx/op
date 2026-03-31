#!/usr/bin/env bun

import { Op } from './Op.ts';
import type { Failure, Success } from './Outcome.ts';

type PrintOpOutcome = Success<string> | Failure<'ProhibitedWord'> | Failure<'MessageTooLong'> | Failure<
  'unknownError'
>;

type PrintOpFailure = 'ProhibitedWord' | 'MessageTooLong' | 'unknownError';

/**
 Options for PrintOp
 */
export interface PrintOpOptions
{
  /**
   Optional list of prohibited words. If message contains any of these, fails with 'ProhibitedWord'
   */
  prohibitedWords?: string[];

  /**
   Optional maximum message length. If specified and message exceeds this, fails with 'MessageTooLong'

   Default: no limit
   */
  maxLength?: number;
}

/**
 PrintOp — an example op that prints a message to stdout.

 This is a simple demonstration of how to write an op that produces output. For general-purpose printing in ops, just use `console.log()` — the framework patches console to flow through IOContext automatically.

 PrintOp adds optional validation features (prohibited words, max length) as an example of how ops can enforce constraints.

 Example:
 ```ts
 const op = new PrintOp('Hello, world!');
 await op.run();

 // With validation
 const op2 = new PrintOp('Hello', {
   prohibitedWords: ['bad', 'evil'],
   maxLength: 1000
 });
 ```
 */
export class PrintOp extends Op<string, PrintOpFailure>
{
  private message: string;
  private options: PrintOpOptions;

  constructor(
    message: string,
    options?: PrintOpOptions | string[], // Backward compat: string[] = prohibitedWords
  )
  {
    super();
    this.message = message;
    // Backward compatibility: if options is an array, treat it as prohibitedWords
    if (Array.isArray(options))
    {
      this.options = { prohibitedWords: options };
    }
    else
    {
      this.options = options ?? {};
    }
  }

  get name(): string
  {
    return `PrintOp`;
  }

  async run(): Promise<PrintOpOutcome>
  {
    await Promise.resolve();
    try
    {
      // Check for prohibited words
      if (this.options.prohibitedWords?.some((word) => this.message.includes(word)))
      {
        return this.fail('ProhibitedWord' as const, `Message: ${this.message}`);
      }

      // Check message length (only if maxLength is specified)
      if (this.options.maxLength !== undefined && this.message.length > this.options.maxLength)
      {
        return this.fail('MessageTooLong' as const, `Length: ${this.message.length}, Max: ${this.options.maxLength}`);
      }

      // We use this.io.stdout.write() instead of console.log() here because PrintOp writes
      // exact bytes — no trailing newline is appended. Callers control the exact output format.
      // Console is monkey-patched to flow through IOContext too, but console.log() always
      // appends a newline, which would be a behavior change for PrintOp consumers.
      this.io.stdout.write(this.message);
      return this.succeed(this.message);
    }
    catch (error: unknown)
    {
      return this.failWithUnknownError(String(error));
    }
  }
}

if (import.meta.main)
{
  console.log('🎬 PrintOp Demo\n');

  // Test 1: Simple print (no limits)
  console.log('Test 1: Simple print');
  const op1 = new PrintOp('PrintOp can print to stdout! This is the proof! 💪\n');
  const outcome1 = await op1.run();

  // Test 2: Prohibited words (backward compat - array syntax)
  console.log('\nTest 2: Prohibited words validation');
  const outcome2 = await PrintOp.run(
    'But it cannot print PROHIBITED words..',
    ['PROHIBITED'],
  );

  // Test 3: Max length validation
  console.log('\nTest 3: Max length validation');
  const longText = 'a'.repeat(150);
  const outcome3 = await PrintOp.run(longText, { maxLength: 100 });

  // Test 4: Long text with no limit (new default behavior)
  console.log('\nTest 4: Long text with no limit');
  const longHelpText =
    'This is a really long help text that would have failed before, but now PrintOp has no default length limit! '
      .repeat(3);
  const outcome4 = await PrintOp.run(longHelpText + '\n');

  // Verify results
  if (
    outcome1.ok
    && !outcome2.ok && outcome2.failure === 'ProhibitedWord'
    && !outcome3.ok && outcome3.failure === 'MessageTooLong'
    && outcome4.ok
  )
  {
    await PrintOp.run('\n✅ All tests passed! PrintOp now has no default length limit.\n');
  }
  else
  {
    throw new Error('Operation failed!');
  }
}
