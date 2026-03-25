import process from 'node:process';
import type { OpRunnerArgs } from './args.ts';
import { createDefaultLogger, type Logger } from './Logger.ts';
import { RecordableStdin, type StdinSource } from './RecordableStdin.ts';
import { ReplayableStdin } from './ReplayableStdin.ts';
import { TeeStream } from './TeeStream.ts';

/**
 IO Context provides stdin/stdout/stderr streams for ops

 Allows switching between interactive, record, replay, and test modes
 */
export type IOContext = {
  stdin: StdinSource | RecordableStdin | ReplayableStdin;
  stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  stderr: NodeJS.WriteStream | NodeJS.WritableStream;
  mode: 'interactive' | 'record' | 'replay' | 'test';
  logger: Logger;
  // Optional: Keep reference to RecordableStdin for saving later
  recordableStdin?: RecordableStdin;
  // Optional: Keep reference to ReplayableStdin for starting replay
  replayableStdin?: ReplayableStdin;
};

export type IOContextStreams = {
  stdin?: StdinSource;
  stdout?: NodeJS.WriteStream | NodeJS.WritableStream;
  stderr?: NodeJS.WriteStream | NodeJS.WritableStream;
};

function writeLine(
  stream: NodeJS.WriteStream | NodeJS.WritableStream,
  message: string,
): void
{
  stream.write(`${message}\n`);
}

/**
 Create an IOContext from OpRunner configuration

 Handles:
 - Logging: If config.logFile is set, creates paired TeeStreams that write stdout/stderr to terminal and a shared log file
 - Recording: If mode is 'record', creates RecordableStdin to capture input
 - Replay: If mode is 'replay', creates ReplayableStdin to play back session

 @param config - OpRunner configuration from arg parsing
 @returns IOContext with appropriate streams
 */
export async function createIOContext(
  config: OpRunnerArgs,
  streams: IOContextStreams = {},
): Promise<IOContext>
{
  const defaultStdin: StdinSource = streams.stdin ?? process.stdin;
  const defaultStdout = streams.stdout ?? process.stdout;
  const defaultStderr = streams.stderr ?? process.stderr;

  let stdout: NodeJS.WriteStream | NodeJS.WritableStream = defaultStdout;
  let stderr: NodeJS.WriteStream | NodeJS.WritableStream = defaultStderr;

  if (config.logFile)
  {
    const teeStreams = TeeStream.createPair(config.logFile, {
      stdout: defaultStdout,
      stderr: defaultStderr,
    });
    stdout = teeStreams.stdout;
    stderr = teeStreams.stderr;
  }

  // Create stdin - use RecordableStdin if recording, ReplayableStdin if replaying
  let stdin: StdinSource | RecordableStdin | ReplayableStdin = defaultStdin;
  let recordableStdin: RecordableStdin | undefined;
  let replayableStdin: ReplayableStdin | undefined;

  if (config.mode === 'record')
  {
    recordableStdin = new RecordableStdin(defaultStdin);
    // RecordableStdin is compatible with ReadStream (implements EventEmitter interface)
    stdin = recordableStdin;
    writeLine(stdout, `[IOContext] 🔴 Recording input to: ${config.sessionFile}`);
  }
  else if (config.mode === 'replay')
  {
    if (!config.sessionFile)
    {
      throw new Error('[IOContext] --replay requires a session file');
    }
    replayableStdin = await ReplayableStdin.create(config.sessionFile, defaultStdin);
    stdin = replayableStdin;
    // ReplayableStdin will print its own status messages
  }

  // Log configuration info if logging is enabled
  if (config.logFile)
  {
    writeLine(stdout, `[IOContext] 📝 Logging to: ${config.logFile}`);
  }

  const logger = createDefaultLogger({
    logWriter: (message) => writeLine(stdout, message),
    warnWriter: (message) => writeLine(stderr, message),
    errorWriter: (message) => writeLine(stderr, message),
  });

  return {
    stdin,
    stdout,
    stderr,
    mode: config.mode,
    logger,
    recordableStdin,
    replayableStdin,
  };
}
