import type { Buffer } from 'node:buffer';
import { InputRecording } from './InputRecording.ts';
import type { Failure, Success } from './Outcome.ts';
import { PromptForValueOp } from './PromptForValueOp.ts';

type PromptForPasswordOutcome =
  | Success<string>
  | Failure<'canceled' | 'unknownError'>;

/**
 Prompts the user for a password (or other sensitive value).

 Like PromptForValueOp, but:
 - Disables InputRecording while reading, so the password is never persisted to session files
 - Enables raw mode to suppress terminal echo (the typed characters are not displayed)

 @example
 ```typescript
 const outcome = await PromptForPasswordOp.run('Enter token: ');
 if (outcome.ok) {
   const secret = outcome.value;
 }
 ```
 */
export class PromptForPasswordOp extends PromptForValueOp
{
  override name = 'PromptForPasswordOp';

  constructor(prompt: string = 'Password: ')
  {
    super(prompt);
  }

  /**
   Overridden to not trim the input, since whitespace may be significant in passwords.
   */
  protected override normalizeInput(line: string): string
  {
    return line;
  }

  override async run(): Promise<PromptForPasswordOutcome>
  {
    const resolvedIO = this.io;
    const { stdin } = resolvedIO;

    // This works around an issue where Deno, unlike Bun and Node (as of 2026-03-21 anyway), exposes `setRawMode` on `stdin` even when it is a non-TTY stream — but throws an error if you try to call it. However, I've seen weirdness with Bun before around this, so it just makes sense to be defensive:
    const stdinHasSetRawMode = 'isTTY' in stdin
      && stdin.isTTY === true
      && 'setRawMode' in stdin
      && typeof stdin.setRawMode === 'function';

    // Save prior raw mode state so we can restore it, not just blindly set false.
    // Node/Bun/Deno expose `isRaw` on TTY stdin streams.
    const wasRaw = stdinHasSetRawMode
      && 'isRaw' in stdin
      && (stdin as { isRaw: boolean }).isRaw;

    try
    {
      InputRecording.prohibit();

      if (stdinHasSetRawMode)
      {
        (stdin as { setRawMode: (mode: boolean) => void }).setRawMode(true);
      }

      // When in raw mode, we read byte-by-byte instead of using readline. This is necessary because raw mode means Ctrl-C (0x03) arrives as data rather than generating SIGINT — we need to handle it ourselves. When NOT in raw mode (piped stdin, etc.), fall back to readline via super.
      if (!stdinHasSetRawMode)
      {
        const outcome = await super.run();
        resolvedIO.stdout.write('\n');
        return outcome;
      }

      resolvedIO.stdout.write(this.prompt);

      const line = await new Promise<string | null>((resolve) =>
      {
        let buffer = '';
        const stdinStream = stdin as NodeJS.ReadableStream;

        const onData = (chunk: Buffer | string): void =>
        {
          const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');

          for (const ch of str)
          {
            const code = ch.charCodeAt(0);

            if (code === 0x03)
            {
              // Ctrl-C
              cleanup();
              resolve(null);
              return;
            }

            if (code === 0x0D || code === 0x0A)
            {
              // Enter
              cleanup();
              resolve(buffer);
              return;
            }

            if (code === 0x7F || code === 0x08)
            {
              // Backspace / Delete
              buffer = buffer.slice(0, -1);
              continue;
            }

            // Ignore other control characters
            if (code < 0x20)
            {
              continue;
            }

            buffer += ch;
          }
        };

        const onEnd = (): void =>
        {
          cleanup();
          resolve(null);
        };

        const cleanup = (): void =>
        {
          stdinStream.removeListener('data', onData);
          stdinStream.removeListener('end', onEnd);
          if ('pause' in stdinStream && typeof stdinStream.pause === 'function')
          {
            stdinStream.pause();
          }
        };

        stdinStream.on('data', onData);
        stdinStream.on('end', onEnd);

        if ('resume' in stdinStream && typeof stdinStream.resume === 'function')
        {
          stdinStream.resume();
        }
      });

      resolvedIO.stdout.write('\n');

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
    finally
    {
      if (stdinHasSetRawMode)
      {
        (stdin as { setRawMode: (mode: boolean) => void }).setRawMode(wasRaw);
      }

      InputRecording.removeProhibition();
    }
  }
}

if (import.meta.main)
{
  const op = new PromptForPasswordOp('Enter secret: ');
  const outcome = await op.run();
  if (outcome.ok)
  {
    console.log(`Secret length: ${outcome.value.length} characters`);
  }
  else
  {
    console.error(`Input failed: ${outcome.failure}`);
  }
}
