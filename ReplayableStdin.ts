import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import {
  BufferedStdin,
  type InputChunk,
  type StdinSource,
} from './BufferedStdin.ts';
import { InputRecording } from './InputRecording.ts';
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
  private replayWithOriginalTiming = false;
  private echoStream?: NodeJS.WriteStream | NodeJS.WritableStream;
  private didResumeSource = false;

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

   @param sessionPath - Path to the session JSON file
   @param stdinSource - The underlying stdin stream (default: process.stdin)
   @param echoStream - If provided, replayed input data is written here during replay to simulate terminal echo (the visual appearance of the user typing). Pass stdout to make replay look like an interactive session.
   */
  static async create(
    sessionPath: string,
    stdinSource: StdinSource = process.stdin,
    echoStream?: NodeJS.WriteStream | NodeJS.WritableStream,
  ): Promise<ReplayableStdin>
  {
    const sessionContent = await readFile(sessionPath, 'utf-8');
    const session = JSON.parse(sessionContent) as Session;
    const instance = new ReplayableStdin(session, sessionPath, stdinSource);
    instance.echoStream = echoStream;
    return instance;
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
   @param useOriginalTiming - If true, replay events with the original wall-clock delays from the recording. If false (default), fire events with minimal delays (10ms between each). Original timing is rarely useful for replay — it just makes the replay take as long as the original human interaction.
   */
  startReplay(startupDelay = 100, useOriginalTiming = false): void
  {
    this.replayWithOriginalTiming = useOriginalTiming;
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

    let delay: number;
    if (this.replayWithOriginalTiming)
    {
      const elapsedTime = Date.now() - this.startTime;
      delay = Math.max(0, event.timestamp - elapsedTime);
    }
    else
    {
      // Fire events with minimal delays — just enough for the event loop to
      // process each one before the next arrives.
      delay = 10;
    }

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

      // Echo the replayed data to the output stream so it looks like someone
      // is typing — simulates the terminal echo that happens in interactive mode.
      if (this.echoStream && !InputRecording.disabled)
      {
        this.echoStream.write(event.data);
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
    this.didResumeSource = true;
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

    // If switchToInteractive() resumed the underlying stdin source, pause it
    // back so it doesn't keep the event loop alive after the program is done.
    if (this.didResumeSource)
    {
      this.stdinSource.pause();
      this.didResumeSource = false;
    }
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

  override get isRaw(): boolean
  {
    if (this.isReplaying && this.pendingRawMode !== undefined)
    {
      return this.pendingRawMode;
    }

    return super.isRaw;
  }
}
