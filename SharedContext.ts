import process from 'node:process';
import type { IOContext } from './IOContext.ts';
import { createDefaultLogger } from './Logger.ts';
import { OpRunner } from './OpRunner.ts';

/**
 Ah, the fresh scent of globally-shared mutable state in the morning...
 */
export class SharedContext
{
  static get effectiveIOContext(): IOContext
  {
    /**
     Returns the IO context that ops should use, in order of precedence:
       1. The override default IO context, if it exists (mainly for tests, and some edge cases)
       2. The OpRunner's default IO context, if it exists (set by OpRunner when it runs an op)
       3. The process-scoped IO context, if it exists (set by main()/init() for the life of the process)
       4. A fallback default IO context that uses process.stdin/stdout/stderr and a default logger
     */
    return this.overrideDefaultIOContext
      ?? this.defaultIOContext
      ?? this.processDefaultIOContext
      ?? {
        stdin: process.stdin,
        stdout: process.stdout,
        stderr: process.stderr,
        mode: 'interactive',
        logger: createDefaultLogger(),
      };
  }

  /**
   Anybody may look up this value, but it is owned by OpRunner. Typically there is only one global default IO context for the life of the process, so although it is technically globally-shared mutable state, it is mostly not actually mutated.
   */
  static get defaultIOContext(): IOContext | undefined
  {
    return OpRunner.defaultIOContext;
  }

  private static _processDefaultIOContext: IOContext | null = null;
  private static _overrideIOContext: IOContext | null = null;

  /**
   Creates an IOContext safe to keep around after a runner finishes.

   The key idea is that stdout/stderr/log routing are process-scoped, but record/replay
   stdin wrappers are run-scoped and should not survive beyond the run that created them.
   */
  static createProcessScopedIOContext(ioContext: IOContext): IOContext
  {
    const hasEphemeralInput = ioContext.recordableStdin !== undefined || ioContext.replayableStdin !== undefined;

    return {
      stdin: hasEphemeralInput ? process.stdin : ioContext.stdin,
      stdout: ioContext.stdout,
      stderr: ioContext.stderr,
      mode: hasEphemeralInput && ioContext.mode !== 'test' ? 'interactive' : ioContext.mode,
      logger: ioContext.logger,
    };
  }

  /**
   The process-scoped IO context persists after the active runner ends so that console/log
   output keeps flowing through the same TeeStream/log file for the rest of the process.
   */
  static set processDefaultIOContext(ioContext: IOContext | null)
  {
    this._processDefaultIOContext = ioContext;
  }

  static get processDefaultIOContext(): IOContext | null
  {
    return this._processDefaultIOContext;
  }

  /**
   Anybody may set the override default IO context, as it is explicitly for tests, and unusual cases like integrating with some other library that manipulates stdin/stdout.

   Other entities can decide for themselves whether to support it, but `Op` explicitly will use it if set.
   */
  static set overrideDefaultIOContext(ioContext: IOContext | null)
  {
    this._overrideIOContext = ioContext;
  }

  /**
   If not `null` then somebody (in this library, it woudl only be a test, but in consuming code it could be any app-specific entity) has requested that all ops use this IO context instead of the default one. This is just a global mutable override, with all the downsides that implies, so be careful with this. The main use case is enabling tests for what would otherwise be interactive sequences that touch IO, which justifies the complexity and potential for error that always comes with globally-shared mutable state.
   */
  static get overrideDefaultIOContext(): IOContext | null
  {
    return this._overrideIOContext;
  }
}
