/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { createWriteStream, type WriteStream } from 'node:fs';
import process from 'node:process';
import { Writable } from 'node:stream';
import { stripAnsi } from './stripAnsi.ts';
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

/**
 A writable stream that writes to both console (stdout) and a log file

 "Tee" is named after the Unix `tee` command which reads from stdin
 and writes to both stdout and a file simultaneously.
 */
export class TeeStream extends Writable
{
  private logWriter: WriteStream;
  private logPath: string;
  private options: TeeStreamOptions;

  constructor(logPath: string, options: TeeStreamOptions = {})
  {
    super();
    this.logPath = logPath;
    this.options = options;
    // Create a write stream to the log file
    this.logWriter = createWriteStream(logPath);
  }

  /**
   Write implementation - writes to both console and log file
   */
  override _write(chunk: any, encoding: NodeJS.BufferEncoding, callback: (error?: Error | null) => void): void
  {
    try
    {
      // Write to console (stdout)
      process.stdout.write(chunk, encoding);

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
      const timestampedLines = lines.map((line: string, index: number) =>
      {
        // Don't timestamp empty lines or continuation lines
        if (line.length === 0) return line;
        // Add timestamp to first line and lines after newlines
        if (index === 0 || lines[index - 1].endsWith('\n'))
        {
          return `[${timestamp}] ${line}`;
        }
        return line;
      });

      this.logWriter.write(timestampedLines.join('\n'));

      callback();
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
      // Bun's writer has an end() method
      if ('end' in this.logWriter && typeof this.logWriter.end === 'function')
      {
        this.logWriter.end();
      }
      callback();
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
      if ('end' in this.logWriter && typeof this.logWriter.end === 'function')
      {
        this.logWriter.end();
      }
      callback(error);
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
    return this.logPath;
  }
}
