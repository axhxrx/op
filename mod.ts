// Core
export { Op } from './Op.ts';
export { OpRunner } from './OpRunner.ts';
export * from './Outcome.ts';

// IO
export type { IOContext, IOContextStreams } from './IOContext.ts';
export { createIOContext } from './IOContext.ts';
export { createDefaultLogger, Logger } from './Logger.ts';

// Type guards
export { isOp } from './isOp.ts';
export { isHandler } from './HandlerWithMeta.ts';
export type { HandlerWithMeta } from './HandlerWithMeta.ts';

// Args
export { parseOpRunnerArgs } from './args.ts';
export type { OpRunnerArgs } from './args.ts';

// Record/replay
export { InputRecording } from './InputRecording.ts';
export { RecordableStdin } from './RecordableStdin.ts';
export type { InputEvent, Session } from './RecordableStdin.ts';
export { ReplayableStdin } from './ReplayableStdin.ts';

// I/O utilities
export { hasAnsi, stripAnsi, stripAnsiFromLines } from './stripAnsi.ts';
export { TeeStream, TeeStreamLogSink } from './TeeStream.ts';
export type { TeeStreamOptions, TeeStreamPair, TeeStreamTerminalStreams } from './TeeStream.ts';

// Simple ops
export { ExecOp } from './ExecOp.ts';
export type { ExecOpOptions, ExecResult } from './ExecOp.ts';
export { PrintOp } from './PrintOp.ts';
export type { PrintOpOptions } from './PrintOp.ts';
export { PromptForPasswordOp } from './PromptForPasswordOp.ts';
export { PromptForValueOp } from './PromptForValueOp.ts';

// Entry points
export { init } from './init.ts';
export type { InitResult } from './init.ts';
export { main } from './main.ts';
