import { spawn } from 'node:child_process';
import { Op } from './Op.ts';
import type { Failure, Success } from './Outcome.ts';

/**
 The result of executing a command.
 */
export type ExecResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

type ExecOpFailure = 'commandNotFound' | 'unknownError';

type ExecOpOutcome =
  | Success<ExecResult>
  | Failure<ExecOpFailure>;

/**
 Options for ExecOp.
 */
export type ExecOpOptions = {
  /**
   Text to pipe to the command's stdin. If not provided, stdin is not connected.
   */
  stdinInput?: string;

  /**
   Working directory for the command. Defaults to the current process's cwd.
   */
  cwd?: string;
};

/**
 Executes a command as a subprocess and captures the exit code, signal, stdout, and stderr.

 The op succeeds as long as the command can be spawned — a non-zero exit code or signal termination is not treated as an op failure. It is data in the result. The op only fails if the command cannot be found or an unexpected error occurs during spawning.

 Uses `node:child_process` for Deno/Bun/Node compatibility.

 @example
 ```typescript
 const outcome = await ExecOp.run(['ls', '-la']);
 if (outcome.ok) {
   console.log(`Exit: ${outcome.value.exitCode}`);
   console.log(`Signal: ${outcome.value.signal}`);
   console.log(`Output: ${outcome.value.stdout}`);
 }
 ```

 @example
 ```typescript
 // Pipe stdin to a command
 const outcome = await ExecOp.run(['cat'], { stdinInput: 'hello' });
 ```
 */
export class ExecOp extends Op<ExecResult, ExecOpFailure>
{
  name: string;
  private command: string[];
  private options: ExecOpOptions;

  constructor(command: string[], options: ExecOpOptions = {})
  {
    super();
    this.command = command;
    this.options = options;
    this.name = `ExecOp(${command[0] ?? '?'})`;
  }

  async run(): Promise<ExecOpOutcome>
  {
    const [cmd, ...args] = this.command;
    if (!cmd)
    {
      return this.fail('commandNotFound' as const, 'Empty command array');
    }

    try
    {
      const result = await new Promise<ExecResult>((resolve, reject) =>
      {
        const stdinMode = this.options.stdinInput === undefined ? 'ignore' : 'pipe';
        const child = spawn(cmd, args, {
          cwd: this.options.cwd,
          stdio: [stdinMode, 'pipe', 'pipe'],
        });

        const stdoutChunks: string[] = [];
        const stderrChunks: string[] = [];
        let settled = false;

        const cleanup = (): void =>
        {
          child.off('error', onChildError);
          child.off('close', onClose);
          child.stdout?.off('data', onStdoutData);
          child.stderr?.off('data', onStderrData);
          child.stdin?.off('error', onStdinError);
        };

        const resolveOnce = (value: ExecResult): void =>
        {
          if (settled)
          {
            return;
          }

          settled = true;
          cleanup();
          resolve(value);
        };

        const rejectOnce = (error: Error): void =>
        {
          if (settled)
          {
            return;
          }

          settled = true;
          cleanup();
          reject(error);
        };

        const onStdoutData = (chunk: string): void =>
        {
          stdoutChunks.push(chunk);
        };

        const onStderrData = (chunk: string): void =>
        {
          stderrChunks.push(chunk);
        };

        const onChildError = (error: NodeJS.ErrnoException): void =>
        {
          if (error.code === 'ENOENT')
          {
            rejectOnce(new ExecNotFoundError(cmd));
            return;
          }

          rejectOnce(error);
        };

        const onClose = (code: number | null, signal: NodeJS.Signals | null): void =>
        {
          resolveOnce({
            exitCode: code,
            signal,
            stdout: stdoutChunks.join(''),
            stderr: stderrChunks.join(''),
          });
        };

        const onStdinError = (error: NodeJS.ErrnoException): void =>
        {
          if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED')
          {
            return;
          }

          rejectOnce(error);
        };

        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', onStdoutData);
        child.stderr?.on('data', onStderrData);
        child.on('error', onChildError);
        child.on('close', onClose);
        child.stdin?.on('error', onStdinError);

        if (this.options.stdinInput !== undefined)
        {
          try
          {
            child.stdin?.end(this.options.stdinInput);
          }
          catch (error: unknown)
          {
            const stdinError = error as NodeJS.ErrnoException;
            if (stdinError.code !== 'EPIPE' && stdinError.code !== 'ERR_STREAM_DESTROYED')
            {
              rejectOnce(stdinError);
            }
          }
        }
      });

      return this.succeed(result);
    }
    catch (error: unknown)
    {
      if (error instanceof ExecNotFoundError)
      {
        return this.fail('commandNotFound' as const, error.message);
      }
      return this.failWithUnknownError(String(error));
    }
  }
}

class ExecNotFoundError extends Error
{
  constructor(cmd: string)
  {
    super(`Command not found: ${cmd}`);
  }
}
