import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';

export type InputChunk = Buffer | string;

export type StdinSource = NodeJS.ReadableStream & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
  setEncoding?: (encoding: NodeJS.BufferEncoding) => void;
  ref?: () => void;
  unref?: () => void;
};

export abstract class BufferedStdin extends EventEmitter
{
  protected readonly stdinSource: StdinSource;
  protected encoding?: NodeJS.BufferEncoding;
  protected destroyed = false;

  private readBuffer: Buffer[] = [];
  private closed = false;

  protected constructor(stdinSource: StdinSource)
  {
    super();
    this.stdinSource = stdinSource;
  }

  protected normalizeChunk(data: InputChunk): Buffer
  {
    if (typeof data === 'string')
    {
      return Buffer.from(data, this.encoding);
    }

    return Buffer.from(data);
  }

  protected enqueueChunk(data: InputChunk): void
  {
    const buffer = this.normalizeChunk(data);
    this.readBuffer.push(buffer);
    this.emit('data', this.encoding
      ? buffer.toString(this.encoding)
      : Buffer.from(buffer));
    this.emit('readable');
  }

  protected emitClose(): void
  {
    if (this.closed)
    {
      return;
    }

    this.closed = true;
    this.emit('close');
  }

  protected consumeReadBuffer(size?: number): Buffer | null
  {
    if (this.readBuffer.length === 0)
    {
      return null;
    }

    if (size === undefined || size <= 0)
    {
      return this.readBuffer.shift() ?? null;
    }

    let remaining = size;
    const chunks: Buffer[] = [];

    while (remaining > 0 && this.readBuffer.length > 0)
    {
      const nextChunk = this.readBuffer[0];
      if (!nextChunk)
      {
        break;
      }

      if (nextChunk.length <= remaining)
      {
        chunks.push(this.readBuffer.shift() ?? nextChunk);
        remaining -= nextChunk.length;
        continue;
      }

      chunks.push(nextChunk.subarray(0, remaining));
      this.readBuffer[0] = nextChunk.subarray(remaining);
      remaining = 0;
    }

    return Buffer.concat(chunks);
  }

  protected onRead(_buffer: Buffer): void
  {
    // Hook for subclasses that want read-side behavior like debug logging.
  }

  protected onRef(): void
  {
    // Hook for subclasses that want ref-side behavior like debug logging.
  }

  protected onUnref(): void
  {
    // Hook for subclasses that want unref-side behavior like debug logging.
  }

  protected abstract onDestroy(): void;

  destroy(error?: Error): this
  {
    if (this.destroyed)
    {
      return this;
    }

    this.destroyed = true;
    this.onDestroy();

    if (error)
    {
      this.emit('error', error);
    }

    this.emitClose();
    return this;
  }

  get isTTY(): boolean
  {
    return this.stdinSource.isTTY ?? false;
  }

  get isRaw(): boolean
  {
    return this.stdinSource.isRaw ?? false;
  }

  read(size?: number): Buffer | string | null
  {
    const buffer = this.consumeReadBuffer(size);
    if (!buffer)
    {
      return null;
    }

    this.onRead(buffer);
    return this.encoding
      ? buffer.toString(this.encoding)
      : buffer;
  }

  unshift(chunk: Buffer | string): void
  {
    this.readBuffer.unshift(this.normalizeChunk(chunk));
  }

  setEncoding(encoding: NodeJS.BufferEncoding): this
  {
    this.encoding = encoding;
    this.stdinSource.setEncoding?.(encoding);
    return this;
  }

  ref(): this
  {
    this.onRef();
    this.stdinSource.ref?.();
    return this;
  }

  unref(): this
  {
    this.onUnref();
    this.stdinSource.unref?.();
    return this;
  }
}
