import type { Buffer } from 'node:buffer';
import { createWriteStream, type WriteStream } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';
import { stripAnsi } from './stripAnsi.ts';

type TerminalStream = NodeJS.WriteStream | NodeJS.WritableStream;

/**
 Options for TeeStream
 */
export type TeeStreamOptions = {
  /**
   Strip ANSI escape codes from log file output

   Console output will still have colors/formatting

   Default: false (preserve ANSI codes in log)
   */
  stripAnsi?: boolean;
};

export type TeeStreamPair = {
  stdout: TeeStream;
  stderr: TeeStream;
};

export type TeeStreamTerminalStreams = {
  stdout?: TerminalStream;
  stderr?: TerminalStream;
};

const activeLogSinks = new Map<string, TeeStreamLogSink>();

function acquireSharedLogSink(logPath: string): TeeStreamLogSink
{
  const resolvedLogPath = resolve(logPath);
  const activeLogSink = activeLogSinks.get(resolvedLogPath);
  if (activeLogSink)
  {
    return activeLogSink;
  }

  const logSink = new TeeStreamLogSink(resolvedLogPath);
  activeLogSinks.set(resolvedLogPath, logSink);
  return logSink;
}

export class TeeStreamLogSink
{
  private static readonly releaseWithoutRetainMessage = '[TeeStream] release() called more times than retain()';

  private logWriter: WriteStream;
  private pendingWrite: Promise<void> = Promise.resolve();
  private refCount = 0;
  private closePromise?: Promise<void>;

  private logPath: string;

  constructor(logPath: string)
  {
    this.logPath = logPath;
    this.logWriter = createWriteStream(logPath);
  }

  /**
   [Obj-C retain] never die! We just multiply — Obj-Colors, Obj-Colors...
   */
  retain(): void
  {
    this.refCount += 1;
  }

  append(text: string): Promise<void>
  {
    if (this.closePromise)
    {
      return Promise.reject(new Error('[TeeStream] Cannot write after log sink is closing'));
    }

    const writeTask = this.pendingWrite.then(() =>
      new Promise<void>((resolve, reject) =>
      {
        this.logWriter.write(text, (error?: Error | null) =>
        {
          if (error)
          {
            reject(error);
            return;
          }
          resolve();
        });
      })
    );

    this.pendingWrite = writeTask.then(
      () => undefined,
      () => undefined,
    );

    return writeTask;
  }

  private close(): Promise<void>
  {
    if (!this.closePromise)
    {
      this.closePromise = this.pendingWrite
        .then(() =>
          new Promise<void>((resolve, reject) =>
          {
            const handleFinish = (): void =>
            {
              this.logWriter.off('error', handleError);
              resolve();
            };
            const handleError = (error: Error): void =>
            {
              this.logWriter.off('finish', handleFinish);
              reject(error);
            };

            this.logWriter.once('finish', handleFinish);
            this.logWriter.once('error', handleError);
            this.logWriter.end();
          })
        )
        .finally(() =>
        {
          if (activeLogSinks.get(this.logPath) === this)
          {
            activeLogSinks.delete(this.logPath);
          }
        });
    }

    return this.closePromise;
  }

  /**
   [Obj-C release] never die! We just multiply — Obj-Colors, Obj-Colors...
   */
  async release(): Promise<void>
  {
    if (this.refCount === 0)
    {
      await this.close();
      throw new Error(TeeStreamLogSink.releaseWithoutRetainMessage);
    }

    this.refCount -= 1;
    if (this.refCount > 0)
    {
      return;
    }

    await this.close();
  }

  getLogPath(): string
  {
    return this.logPath;
  }
}

/**
 A writable stream that writes to a terminal stream and a shared log file

 "Tee" is named after the Unix `tee` command which reads from stdin and writes to both stdout and a file simultaneously.
 */
export class TeeStream extends Writable
{
  private terminalStream: TerminalStream;
  private logSink: TeeStreamLogSink;
  private options: TeeStreamOptions;
  private released = false;

  constructor(
    logPath: string,
    options: TeeStreamOptions = {},
    terminalStream: TerminalStream = process.stdout,
    logSink?: TeeStreamLogSink,
  )
  {
    super();
    this.options = options;
    this.terminalStream = terminalStream;
    this.logSink = logSink ?? acquireSharedLogSink(logPath);
    this.logSink.retain();
  }

  static createPair(
    logPath: string,
    terminalStreams: TeeStreamTerminalStreams = {},
    options: TeeStreamOptions = {},
  ): TeeStreamPair
  {
    const logSink = acquireSharedLogSink(logPath);

    return {
      stdout: new TeeStream(
        logPath,
        options,
        terminalStreams.stdout ?? process.stdout,
        logSink,
      ),
      stderr: new TeeStream(
        logPath,
        options,
        terminalStreams.stderr ?? process.stderr,
        logSink,
      ),
    };
  }

  private releaseLogSink(callback: (error?: Error | null) => void): void
  {
    if (this.released)
    {
      callback();
      return;
    }

    this.released = true;
    this.logSink.release().then(
      () => callback(),
      (error: unknown) => callback(error as Error),
    );
  }

  private writeToTerminal(
    chunk: Buffer | string,
    encoding: NodeJS.BufferEncoding,
  ): Promise<void>
  {
    return new Promise<void>((resolve, reject) =>
    {
      const terminalStream = this.terminalStream as Writable;
      let callbackCompleted = false;
      let drained = false;
      let waitingForDrain = false;

      const cleanup = (): void =>
      {
        terminalStream.off('error', handleError);
        if (waitingForDrain)
        {
          terminalStream.off('drain', handleDrain);
        }
      };

      const finishIfReady = (): void =>
      {
        if (!callbackCompleted || !drained)
        {
          return;
        }

        cleanup();
        resolve();
      };

      const handleError = (error: Error): void =>
      {
        cleanup();
        reject(error);
      };

      const handleDrain = (): void =>
      {
        drained = true;
        finishIfReady();
      };

      const handleWriteComplete = (): void =>
      {
        callbackCompleted = true;
        finishIfReady();
      };

      terminalStream.once('error', handleError);

      if (typeof chunk === 'string')
      {
        waitingForDrain = !terminalStream.write(chunk, encoding, handleWriteComplete);
      }
      else
      {
        waitingForDrain = !terminalStream.write(chunk, handleWriteComplete);
      }

      if (waitingForDrain)
      {
        terminalStream.once('drain', handleDrain);
      }
      else
      {
        drained = true;
      }

      finishIfReady();
    });
  }

  /**
   Write implementation - writes to both terminal and log file
   */
  override _write(chunk: Buffer | string, encoding: NodeJS.BufferEncoding,
    callback: (error?: Error | null) => void): void
  {
    try
    {
      // Write to log file with timestamp
      const timestamp = new Date().toISOString();
      let text = chunk.toString();

      // Strip ANSI codes if requested
      if (this.options.stripAnsi)
      {
        text = stripAnsi(text);
      }

      // Only add timestamp at the start of new lines
      const lines = text.split('\n');
      const timestampedLines = lines.map((line: string) =>
      {
        // Don't timestamp empty lines or continuation lines
        if (line.length === 0) return line;
        // Add a timestamp to each non-empty line in the chunk
        return `[${timestamp}] ${line}`;
      });

      Promise.all([
        this.writeToTerminal(chunk, encoding),
        this.logSink.append(timestampedLines.join('\n')),
      ]).then(
        () => callback(),
        (error: unknown) => callback(error as Error),
      );
    }
    catch (error)
    {
      callback(error as Error);
    }
  }

  /**
   Final cleanup - flush and close the log file
   */
  override _final(callback: (error?: Error | null) => void): void
  {
    try
    {
      this.releaseLogSink(callback);
    }
    catch (error)
    {
      callback(error as Error);
    }
  }

  /**
   Clean up when stream is destroyed
   */
  override _destroy(error: Error | null, callback: (error: Error | null) => void): void
  {
    try
    {
      this.releaseLogSink((releaseError) =>
      {
        callback((releaseError as Error | null | undefined) ?? error);
      });
    }
    catch (err)
    {
      callback(err as Error);
    }
  }

  /**
   Get the path to the log file
   */
  getLogPath(): string
  {
    return this.logSink.getLogPath();
  }
}
