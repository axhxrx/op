import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { BufferedStdin, type InputChunk, type StdinSource } from './BufferedStdin.ts';
import { InputRecording } from './InputRecording.ts';

export type { StdinSource } from './BufferedStdin.ts';

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

 This is a transparent proxy around stdin that:
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
export class RecordableStdin extends BufferedStdin
{
  private recording: InputEvent[] = [];
  private startTime: number;
  private sessionTimestamp: string;

  private readonly handleData = (data: InputChunk): void =>
  {
    if (this.destroyed)
    {
      return;
    }

    const str = typeof data === 'string'
      ? data
      : data.toString();

    if (!InputRecording.disabled)
    {
      this.recording.push({
        timestamp: Date.now() - this.startTime,
        data: str,
      });
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

  constructor(stdinSource: StdinSource = process.stdin)
  {
    super(stdinSource);
    this.startTime = Date.now();
    this.sessionTimestamp = new Date().toISOString();

    this.stdinSource.resume();
    this.attachSourceListeners();
  }

  private attachSourceListeners(): void
  {
    this.stdinSource.on('data', this.handleData);
    this.stdinSource.on('end', this.handleEnd);
    this.stdinSource.on('error', this.handleError);
    this.stdinSource.on('close', this.handleClose);
  }

  private detachSourceListeners(): void
  {
    this.stdinSource.off('data', this.handleData);
    this.stdinSource.off('end', this.handleEnd);
    this.stdinSource.off('error', this.handleError);
    this.stdinSource.off('close', this.handleClose);
  }

  /**
   Save the recorded session to a file
   */
  async saveSession(path: string): Promise<Session>
  {
    const session: Session = {
      version: '1.0',
      timestamp: this.sessionTimestamp,
      events: this.recording,
    };

    await writeFile(path, JSON.stringify(session, null, 2), 'utf-8');
    return session;
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

  protected override onDestroy(): void
  {
    this.detachSourceListeners();
  }

  setRawMode(mode: boolean): this
  {
    if (this.stdinSource.isTTY && this.stdinSource.setRawMode)
    {
      this.stdinSource.setRawMode(mode);
    }
    return this;
  }

  pause(): this
  {
    this.stdinSource.pause();
    return this;
  }

  resume(): this
  {
    this.stdinSource.resume();
    return this;
  }
}
