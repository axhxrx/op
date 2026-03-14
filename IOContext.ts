import type { OpRunnerArgs } from './args.ts';
import { createDefaultLogger, type Logger } from './Logger.ts';
import { RecordableStdin } from './RecordableStdin.ts';
import { ReplayableStdin } from './ReplayableStdin.ts';
import { TeeStream } from './TeeStream.ts';

/**
 IO Context provides stdin/stdout streams for ops

 Allows switching between interactive, record, replay, and test modes
 */
export type IOContext = {
  stdin: NodeJS.ReadStream | RecordableStdin | ReplayableStdin;
  stdout: NodeJS.WriteStream | NodeJS.WritableStream;
  mode: 'interactive' | 'record' | 'replay' | 'test';
  logger: Logger;
  // Optional: Keep reference to RecordableStdin for saving later
  recordableStdin?: RecordableStdin;
  // Optional: Keep reference to ReplayableStdin for starting replay
  replayableStdin?: ReplayableStdin;
};

/**
 Create an IOContext from OpRunner configuration

 Handles:
 - Logging: If config.logFile is set, creates TeeStream to write to both console and file
 - Recording: If mode is 'record', creates RecordableStdin to capture input
 - Replay: If mode is 'replay', creates ReplayableStdin to play back session

 @param config - OpRunner configuration from arg parsing
 @returns IOContext with appropriate streams
 */
export async function createIOContext(config: OpRunnerArgs): Promise<IOContext>
{
  // Create stdin - use RecordableStdin if recording, ReplayableStdin if replaying
  let stdin: NodeJS.ReadStream | RecordableStdin | ReplayableStdin = process.stdin;
  let recordableStdin: RecordableStdin | undefined;
  let replayableStdin: ReplayableStdin | undefined;

  if (config.mode === 'record')
  {
    recordableStdin = new RecordableStdin();
    // RecordableStdin is compatible with ReadStream (implements EventEmitter interface)
    stdin = recordableStdin;
    console.log(`[IOContext] 🔴 Recording input to: ${config.sessionFile}\n`);
  }
  else if (config.mode === 'replay')
  {
    if (!config.sessionFile)
    {
      throw new Error('[IOContext] --replay requires a session file');
    }
    replayableStdin = await ReplayableStdin.create(config.sessionFile);
    stdin = replayableStdin;
    // ReplayableStdin will print its own status messages
  }

  // Create stdout - use TeeStream if logging is enabled
  const stdout = config.logFile
    ? new TeeStream(config.logFile)
    : process.stdout;

  // Log configuration info if logging is enabled
  if (config.logFile)
  {
    console.log(`[IOContext] 📝 Logging to: ${config.logFile}\n`);
  }

  // Create logger (simple for now, no namespace)
  const logger = createDefaultLogger();

  return {
    stdin,
    stdout,
    mode: config.mode,
    logger,
    recordableStdin,
    replayableStdin,
  };
}
