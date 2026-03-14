/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
/**
 Represents a single input event (keystroke)
 */
export type InputEvent = {
  timestamp: number;
  data: string;
};

/**
 Session file format
 */
export type Session = {
  version: '1.0';
  timestamp: string;
  events: InputEvent[];
};

/**
 RecordableStdin - Records user input for later replay

 This is a transparent proxy around process.stdin that:
 1. Forwards all input to the app (so it works normally)
 2. Records every keystroke with timestamps
 3. Can save the recording to a JSON file

 Usage:
 ```ts
 const stdin = new RecordableStdin();
 // ... use stdin in your app ...
 await stdin.saveSession('session.json');
 ```
 */
export class RecordableStdin extends EventEmitter
{
  private recording: InputEvent[] = [];
  private startTime: number;
  private sessionTimestamp: string;

  constructor()
  {
    super();

    this.startTime = Date.now();
    this.sessionTimestamp = new Date().toISOString();

    // DON'T set raw mode here - let Ink do it via our setRawMode method

    // Resume stdin so we get input
    process.stdin.resume();

    // Listen to stdin and record + forward
    process.stdin.on('data', (data: Buffer) =>
    {
      const str = data.toString();

      // Record the input with relative timestamp
      this.recording.push({
        timestamp: Date.now() - this.startTime,
        data: str,
      });

      // Forward to our emitter (so Ink and other consumers get it)
      this.emit('data', data);
    });

    // Forward other events
    process.stdin.on('end', () => this.emit('end'));
    process.stdin.on('error', (err) => this.emit('error', err));
    process.stdin.on('readable', () => this.emit('readable'));
    process.stdin.on('close', () => this.emit('close'));
  }

  /**
   Save the recorded session to a file
   */
  async saveSession(path: string): Promise<void>
  {
    const session: Session = {
      version: '1.0',
      timestamp: this.sessionTimestamp,
      events: this.recording,
    };

    await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
    console.log(`\n[RecordableStdin] 💾 Session saved to: ${path}`);
    console.log(`[RecordableStdin] 📊 Recorded ${this.recording.length} input events`);
  }

  /**
   Get the current recording (useful for debugging)
   */
  getRecording(): InputEvent[]
  {
    return [...this.recording];
  }

  /**
   Get the number of recorded events
   */
  getEventCount(): number
  {
    return this.recording.length;
  }

  // Implement stream-like interface for compatibility
  setRawMode(mode: boolean): this
  {
    if (process.stdin.isTTY)
    {
      process.stdin.setRawMode(mode);
    }
    return this;
  }

  pause(): this
  {
    process.stdin.pause();
    return this;
  }

  resume(): this
  {
    process.stdin.resume();
    return this;
  }

  get isTTY(): boolean
  {
    return process.stdin.isTTY ?? false;
  }

  // Additional compatibility methods for Ink
  get isRawModeSupported(): boolean
  {
    return process.stdin.isTTY ?? false;
  }

  // Readable stream interface
  read(size?: number): any
  {
    return process.stdin.read(size);
  }

  unshift(chunk: any): void
  {
    if ('unshift' in process.stdin && typeof process.stdin.unshift === 'function')
    {
      process.stdin.unshift(chunk);
    }
  }

  // Encoding
  setEncoding(encoding: NodeJS.BufferEncoding): this
  {
    process.stdin.setEncoding(encoding);
    return this;
  }

  // Event loop reference management (required by Ink)
  ref(): this
  {
    if ('ref' in process.stdin && typeof process.stdin.ref === 'function')
    {
      process.stdin.ref();
    }
    return this;
  }

  unref(): this
  {
    if ('unref' in process.stdin && typeof process.stdin.unref === 'function')
    {
      process.stdin.unref();
    }
    return this;
  }
}
