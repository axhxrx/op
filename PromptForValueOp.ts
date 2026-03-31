#!/usr/bin/env deno run

import { createInterface } from 'node:readline';
import { Op } from './Op.ts';
import type { Failure, Success } from './Outcome.ts';

type PromptForValueFailure = 'canceled' | 'unknownError';

type PromptForValueOutcome =
  | Success<string>
  | Failure<PromptForValueFailure>;

/**
 Prompts the user for a single line of text input.

 Writes the prompt string to stdout, reads a line from stdin, and returns the trimmed value. Returns a 'canceled' failure if the input stream closes before a line is read (e.g. Ctrl+D / EOF).

 @example
 ```typescript
 class LoginOp extends Op<void, 'canceled' | 'unknownError'> {
   name = 'LoginOp';
   async execute() {
     const result = await new PromptForValueOp('Username: ').run();
     if (!result.ok) return this.cancel();
     const username = result.value;
     // ...
   }
 }
 ```
 */
export class PromptForValueOp extends Op<string, PromptForValueFailure>
{
  name = 'PromptForValueOp';
  protected readonly prompt: string;

  constructor(prompt: string = '> ')
  {
    super();
    this.prompt = prompt;
  }

  protected normalizeInput(line: string): string
  {
    return line.trim();
  }

  async execute(): Promise<PromptForValueOutcome>
  {
    const { stdin, stdout } = this.io;

    try
    {
      const rl = createInterface({
        input: stdin as NodeJS.ReadableStream,
        output: stdout as NodeJS.WritableStream,
        terminal: false,
      });

      const line = await new Promise<string | null>((resolve) =>
      {
        stdout.write(this.prompt);

        const onLine = (data: string): void =>
        {
          cleanup();
          resolve(data);
        };

        const onClose = (): void =>
        {
          cleanup();
          resolve(null);
        };

        const cleanup = (): void =>
        {
          rl.off('line', onLine);
          rl.off('close', onClose);
          rl.close();
        };

        rl.once('line', onLine);
        rl.once('close', onClose);
      });

      if (line === null)
      {
        return this.cancel();
      }

      return this.succeed(this.normalizeInput(line));
    }
    catch (error: unknown)
    {
      return this.failWithUnknownError(String(error));
    }
  }
}

if (import.meta.main)
{
  // Example usage when run directly:
  const op = new PromptForValueOp('Enter something: ');
  const outcome = await op.run();
  if (outcome.ok)
  {
    console.log(`You entered: ${outcome.value}`);
  }
  else
  {
    console.error(`Input failed: ${outcome.failure}`);
  }
}
