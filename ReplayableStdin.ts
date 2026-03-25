import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import {
  BufferedStdin,
  type InputChunk,
  type StdinSource,
} from './BufferedStdin.ts';
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
export class ReplayableStdin extends BufferedStdin
{
  /** Enable debug logging */
  static DEBUG = false;

  private queue: InputEvent[];
  private index = 0;
  private isReplaying = true;
  private sessionTimestamp: string;
  private startTime: number;
  private replayTimeout?: ReturnType<typeof setTimeout>;
  private interactiveListenersAttached = false;
  private pendingRawMode?: boolean;

  private readonly handleInteractiveData = (data: InputChunk): void =>
  {
    if (this.destroyed)
    {
      return;
    }

    this.enqueueChunk(data);
  };

  private readonly handleEnd = (): void =>
  {
    this.emit('end');
  };

  private readonly handleError = (error: Error): void =>
  {
    this.emit('error', error);
  };

  private readonly handleClose = (): void =>
  {
    this.emitClose();
  };

  private constructor(
    session: Session,
    sessionPath: string,
    stdinSource: StdinSource,
  )
  {
    super(stdinSource);
    this.queue = session.events;
    this.sessionTimestamp = session.timestamp;
    this.startTime = Date.now();

    if (ReplayableStdin.DEBUG)
    {
      console.log(`[ReplayableStdin] 📼 Loaded session from: ${sessionPath}`);
      console.log(`[ReplayableStdin] 📅 Recorded: ${this.sessionTimestamp}`);
      console.log(`[ReplayableStdin] 🎬 Replaying ${this.queue.length} events...\n`);
    }
  }

  /**
   Create a ReplayableStdin by loading a session file
   */
  static async create(
    sessionPath: string,
    stdinSource: StdinSource = process.stdin,
  ): Promise<ReplayableStdin>
  {
    const sessionContent = await readFile(sessionPath, 'utf-8');
    const session = JSON.parse(sessionContent) as Session;
    return new ReplayableStdin(session, sessionPath, stdinSource);
  }

  private attachInteractiveListeners(): void
  {
    if (this.interactiveListenersAttached)
    {
      return;
    }

    this.interactiveListenersAttached = true;
    this.stdinSource.on('data', this.handleInteractiveData);
    this.stdinSource.on('end', this.handleEnd);
    this.stdinSource.on('error', this.handleError);
    this.stdinSource.on('close', this.handleClose);
  }

  private detachInteractiveListeners(): void
  {
    if (!this.interactiveListenersAttached)
    {
      return;
    }

    this.interactiveListenersAttached = false;
    this.stdinSource.off('data', this.handleInteractiveData);
    this.stdinSource.off('end', this.handleEnd);
    this.stdinSource.off('error', this.handleError);
    this.stdinSource.off('close', this.handleClose);
  }

  private clearReplayTimeout(): void
  {
    if (this.replayTimeout)
    {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = undefined;
    }
  }

  /**
   Start replaying the session

   @param startupDelay - Milliseconds to wait before starting replay (default: 100ms). This gives the UI time to mount and start listening to stdin.
   */
  startReplay(startupDelay = 100): void
  {
    if (this.destroyed)
    {
      return;
    }

    if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] ⏳ Waiting ${startupDelay}ms for UI to mount...\n`);
    this.clearReplayTimeout();
    this.replayTimeout = setTimeout(() =>
    {
      this.replayTimeout = undefined;
      this.replayNextEvent();
    }, startupDelay);
  }

  private replayNextEvent(): void
  {
    if (this.destroyed)
    {
      return;
    }

    if (this.index >= this.queue.length)
    {
      this.switchToInteractive();
      return;
    }

    const event = this.queue[this.index];
    if (!event)
    {
      this.switchToInteractive();
      return;
    }

    const elapsedTime = Date.now() - this.startTime;
    const eventTime = event.timestamp;
    const delay = Math.max(0, eventTime - elapsedTime);

    this.replayTimeout = setTimeout(() =>
    {
      this.replayTimeout = undefined;

      if (this.destroyed)
      {
        return;
      }

      if (ReplayableStdin.DEBUG)
      {
        console.log(`[ReplayableStdin] ⚡ Event ${this.index + 1}/${this.queue.length}: ${JSON.stringify(event.data)}`);
        console.log(`[ReplayableStdin] 🔍 'readable' listener count: ${this.listenerCount('readable')}`);
      }

      this.enqueueChunk(Buffer.from(event.data, this.encoding));

      if (ReplayableStdin.DEBUG) console.log(`[ReplayableStdin] ✅ replay event emitted`);

      this.index += 1;
      this.replayNextEvent();
    }, delay);
  }

  private switchToInteractive(): void
  {
    if (this.destroyed || !this.isReplaying)
    {
      return;
    }

    if (ReplayableStdin.DEBUG) console.log('\n[ReplayableStdin] ✅ Replay complete!');
    if (ReplayableStdin.DEBUG) console.log('[ReplayableStdin] 🎮 Switching to interactive mode...\n');

    this.isReplaying = false;

    if (this.pendingRawMode !== undefined && this.stdinSource.isTTY && this.stdinSource.setRawMode)
    {
      this.stdinSource.setRawMode(this.pendingRawMode);
    }
    this.stdinSource.resume();
    this.attachInteractiveListeners();
  }

  /**
   Check if currently replaying
   */
  isReplayActive(): boolean
  {
    return this.isReplaying;
  }

  protected override onRead(buffer: Buffer): void
  {
    if (ReplayableStdin.DEBUG)
    {
      console.log(`[ReplayableStdin] 📖 read() called, returning: ${JSON.stringify(buffer.toString())}`);
    }
  }

  protected override onRef(): void
  {
    if (ReplayableStdin.DEBUG)
    {
      console.log('[ReplayableStdin] 🔗 ref() called');
    }
  }

  protected override onUnref(): void
  {
    if (ReplayableStdin.DEBUG)
    {
      console.log('[ReplayableStdin] 🔓 unref() called');
    }
  }

  protected override onDestroy(): void
  {
    this.clearReplayTimeout();
    this.detachInteractiveListeners();
  }

  setRawMode(mode: boolean): this
  {
    if (this.isReplaying)
    {
      this.pendingRawMode = mode;
      return this;
    }

    if (this.stdinSource.isTTY && this.stdinSource.setRawMode)
    {
      this.stdinSource.setRawMode(mode);
    }
    return this;
  }

  pause(): this
  {
    if (!this.isReplaying)
    {
      this.stdinSource.pause();
    }
    return this;
  }

  resume(): this
  {
    if (!this.isReplaying)
    {
      this.stdinSource.resume();
    }
    return this;
  }
}
