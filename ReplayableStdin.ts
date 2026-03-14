/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { InputEvent, Session } from './RecordableStdin.ts';
/**
 ReplayableStdin - Replays recorded user input, then switches to interactive mode once session replay finishes.

 How it works:
 1. Loads a session file created by RecordableStdin
 2. Emits the recorded keystrokes at the right times
 3. When replay finishes, seamlessly switches to real stdin
 4. User can continue interacting normally

 Usage:
 ```ts
 const stdin = new ReplayableStdin('session.json');
 await stdin.startReplay();
 // Session plays back, then becomes interactive!
 * ```
 */
export class ReplayableStdin extends EventEmitter
{
  /** Enable debug logging (set to false to avoid interfering with Ink UI) */
  static DEBUG = false;

  private queue: InputEvent[];
  private index = 0;
  private isReplaying = true;
  private sessionTimestamp: string;
  private startTime: number;
  private readBuffer: Buffer[] = []; // Buffer for read() method

  private constructor(session: Session, sessionPath: string)
  {
    super();

    this.queue = session.events;
    this.sessionTimestamp = session.timestamp;
    this.startTime = Date.now();

    if (ReplayableStdin.DEBUG)
    {
      if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] 📼 Loaded session from: ${sessionPath}`);
      if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] 📅 Recorded: ${this.sessionTimestamp}`);
      if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] 🎬 Replaying ${this.queue.length} events...\n`);
    }
  }

  /**
   Create a ReplayableStdin by loading a session file
   */
  static async create(sessionPath: string): Promise<ReplayableStdin>
  {
    const sessionContent = await readFile(sessionPath, 'utf-8');
    const session = JSON.parse(sessionContent) as Session;
    return new ReplayableStdin(session, sessionPath);
  }

  /**
   Start replaying the session

   @param startupDelay - Milliseconds to wait before starting replay (default: 100ms)
                          This gives Ink time to mount and start listening to stdin
   */
  startReplay(startupDelay = 100): void
  {
    if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] ⏳ Waiting ${startupDelay}ms for UI to mount...\n`);
    setTimeout(() =>
    {
      this.replayNextEvent();
    }, startupDelay);
  }

  private replayNextEvent(): void
  {
    if (this.index >= this.queue.length)
    {
      // Replay complete - switch to interactive!
      this.switchToInteractive();
      return;
    }

    const event = this.queue[this.index];
    if (!event)
    {
      // Should never happen, but TypeScript wants the check
      this.switchToInteractive();
      return;
    }

    // Calculate delay until this event should fire
    const elapsedTime = Date.now() - this.startTime;
    const eventTime = event.timestamp;
    const delay = Math.max(0, eventTime - elapsedTime);

    setTimeout(() =>
    {
      if (!event)
      {
        return;
      }

      // Buffer the data and emit 'readable' (Ink uses 'readable' not 'data')
      if (ReplayableStdin.DEBUG)
      {
        console.log(`[ReplayableStdin] ⚡ Event ${this.index + 1}/${this.queue.length}: ${JSON.stringify(event.data)}`);
      }
      if (ReplayableStdin.DEBUG)
      {
        console.log(`[ReplayableStdin] 🔍 'readable' listener count: ${this.listenerCount('readable')}`);
      }

      const buffer = Buffer.from(event.data);
      this.readBuffer.push(buffer);

      // Emit 'readable' so Ink knows to call read()
      this.emit('readable');
      if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] ✅ 'readable' event emitted`);

      this.index++;

      // Schedule next event
      this.replayNextEvent();
    }, delay);
  }

  private switchToInteractive(): void
  {
    if (ReplayableStdin.DEBUG) console.log('\n[ReplayableStdin] ✅ Replay complete!');
    if (ReplayableStdin.DEBUG) console.log('[ReplayableStdin] 🎮 Switching to interactive mode...\n');

    this.isReplaying = false;

    // Set up stdin for interactive mode
    if (process.stdin.isTTY)
    {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    // Forward stdin events to our emitter
    process.stdin.on('data', (data: Buffer) => this.emit('data', data));
    process.stdin.on('end', () => this.emit('end'));
    process.stdin.on('error', (err) => this.emit('error', err));
    process.stdin.on('readable', () => this.emit('readable'));
    process.stdin.on('close', () => this.emit('close'));
  }

  /**
   Check if currently replaying
   */
  isReplayActive(): boolean
  {
    return this.isReplaying;
  }

  // Stream-like interface (same as RecordableStdin for compatibility)

  setRawMode(mode: boolean): this
  {
    // During replay, ignore raw mode changes (we control the timing)
    // After replay, forward to real stdin
    if (!this.isReplaying && process.stdin.isTTY)
    {
      process.stdin.setRawMode(mode);
    }
    return this;
  }

  pause(): this
  {
    if (!this.isReplaying)
    {
      process.stdin.pause();
    }
    return this;
  }

  resume(): this
  {
    if (!this.isReplaying)
    {
      process.stdin.resume();
    }
    return this;
  }

  get isTTY(): boolean
  {
    return process.stdin.isTTY ?? false;
  }

  get isRawModeSupported(): boolean
  {
    return process.stdin.isTTY ?? false;
  }

  read(size?: number): any
  {
    // During replay, return buffered data
    if (this.isReplaying && this.readBuffer.length > 0)
    {
      const buffer = this.readBuffer.shift();
      if (ReplayableStdin.DEBUG)
      {
        console.log(`[ReplayableStdin] 📖 read() called, returning: ${JSON.stringify(buffer?.toString())}`);
      }
      return buffer;
    }

    // After replay, read from real stdin
    if (!this.isReplaying)
    {
      return process.stdin.read(size);
    }

    // No data available
    return null;
  }

  unshift(chunk: any): void
  {
    if ('unshift' in process.stdin && typeof process.stdin.unshift === 'function')
    {
      process.stdin.unshift(chunk);
    }
  }

  setEncoding(encoding: NodeJS.BufferEncoding): this
  {
    process.stdin.setEncoding(encoding);
    return this;
  }

  ref(): this
  {
    if (ReplayableStdin.DEBUG) console.log('[ReplayableStdin] 🔗 ref() called by Ink');
    if ('ref' in process.stdin && typeof process.stdin.ref === 'function')
    {
      process.stdin.ref();
    }
    return this;
  }

  unref(): this
  {
    if (ReplayableStdin.DEBUG) console.log('[ReplayableStdin] 🔓 unref() called by Ink');
    if ('unref' in process.stdin && typeof process.stdin.unref === 'function')
    {
      process.stdin.unref();
    }
    return this;
  }

  // Override on/addListener to see when Ink attaches
  override on(event: string, listener: (...args: any[]) => void): this
  {
    if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] 👂 Listener attached for '${event}'`);
    return super.on(event, listener);
  }

  override addListener(event: string, listener: (...args: any[]) => void): this
  {
    if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] 👂 addListener called for '${event}'`);
    return super.addListener(event, listener);
  }
}
