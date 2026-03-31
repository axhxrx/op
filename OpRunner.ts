import { appendFileSync, writeFileSync } from 'node:fs';
import type { OpRunnerArgs } from './args.ts';
import { createIOContext, type IOContext } from './IOContext.ts';
import type { Op } from './Op.ts';
import {
  isOutcome,
  type OutcomeOf,
} from './Outcome.ts';
import { patchConsole } from './patchConsole.ts';

/**
 Stack-based operation runner with full observability

 In the 1.0 model, ops return terminal Outcomes only. Child ops are invoked directly via `childOp.run()`, which delegates to `runOutOfBand()` on the default runner. The stack is used for reentrant save/restore — each out-of-band execution saves the current stack, runs the child on a fresh stack, then restores.

 Benefits:
 - Centralized observability: ONE place where all op transitions happen
 - Log every op that runs, time every op
 - Separation of concerns: Ops describe intent, runner manages lifecycle
 - Easy to add hooks/middleware later (before/after, metrics, tracing, etc.)
 - Testing: Easier to test ops in isolation
 */
export class OpRunner<T extends Op<unknown, unknown>>
{
  /**
   Enable or disable OpRunner's internal logging. Default: false
   */
  static opLoggingEnabled = false;

  /**
   Path to log file for stack mutations. Default: './op-runner-log.txt'
   */
  static logFilePath = './op-runner-log.txt';

  private stack: Array<Op<unknown, unknown>> = [];

  private finalOutcome?: OutcomeOf<T>;
  private io: IOContext;
  private ioConfig: OpRunnerArgs;
  private startTime: number;

  private constructor(
    initialOp: T,
    ioConfig: OpRunnerArgs,
    io: IOContext,
  )
  {
    this.stack = [initialOp];
    this.ioConfig = ioConfig;
    this.io = io;
    this.startTime = Date.now();
  }

  protected static _default?: OpRunner<Op<unknown, unknown>>;

  /**
   The default (and typically only) OpRunner instance for the program. Used by `Op.run()` to delegate to `runOutOfBand()` instead of creating a new runner.
   */
  static get default(): OpRunner<Op<unknown, unknown>> | undefined
  {
    return this._default;
  }

  /**
   The "default IOContext" is just the IO context of the last-created OpRunner instance. This is to reduce required boilerplate in the simplest use cases, e.g., where an op is created and run, and that's it. In a normal application, there should typically be only one OpRunner instance, so this is not a problem. But it's global mutable state, so it's a bit hacky and something to be aware of if doing something unusual like creating multiple OpRunner instances in the same process.
   */
  static get defaultIOContext(): IOContext | undefined
  {
    return this._default?.io;
  }

  /**
   Create an OpRunner instance (async because IO setup may be async).

   **Most consumers should use `main()`, `init()`, or `Op.run()` instead.** This is a lower-level API for advanced use cases like custom entry points or test harnesses.

   As a side effect, this patches `console.log`/`warn`/`error` to flow through the IOContext (idempotent), and sets this runner as the global default. The default runner's IOContext is used by `SharedContext.effectiveIOContext`, which is what `console.log` and `this.io` resolve to.

   Creating multiple OpRunners is discouraged — the last one created becomes the default, and all console output routes to its IOContext. For running additional ops within an already-running program, use `Op.run()` (the static method), which delegates to the default runner's `runOutOfBand()` rather than creating a new runner.

   If `existingIO` is provided, that IOContext is used instead of creating a new one. This is used by `main()` to eagerly create the IOContext before the op factory runs, so that setup-time logging is captured by TeeStream.
   */
  static async create<T extends Op<unknown, unknown>>(
    initialOp: T,
    ioConfig: OpRunnerArgs = { mode: 'interactive' },
    existingIO?: IOContext,
  ): Promise<OpRunner<T>>
  {
    patchConsole();

    const io = existingIO ?? await createIOContext(ioConfig);
    const runner = new OpRunner(initialOp, ioConfig, io);
    this._default = runner as OpRunner<Op<unknown, unknown>>;
    return runner;
  }

  /**
   Run an op on a temporary stack, reusing this runner's IOContext.

   This is the mechanism behind `Op.run()` when called within an already-running program. It creates a fresh stack for the op, executes it, and returns the terminal outcome. The primary stack is suspended during execution and restored afterward.

   This method is reentrant — an op running out-of-band can itself call `Op.run()`, which will nest another out-of-band execution. Each level saves and restores via local variables on the JS call stack, so there's no interleaving.
   */
  async runOutOfBand<U extends Op<unknown, unknown>>(op: U): Promise<OutcomeOf<U>>
  {
    const savedStack = this.stack;
    const savedOutcome = this.finalOutcome;

    this.stack = [op];
    this.finalOutcome = undefined;

    try
    {
      while (await this.runStep())
      {
        // runStep() operates on this.stack, which is now the temporary stack
      }

      if (this.finalOutcome === undefined)
      {
        throw new Error(`[OpRunner] Out-of-band execution of ${op.name} completed without a terminal outcome`);
      }

      return this.finalOutcome as OutcomeOf<U>;
    }
    finally
    {
      this.stack = savedStack;
      this.finalOutcome = savedOutcome;
    }
  }

  /**
   Log to file with timestamp
   */
  private logToFile(message: string): void
  {
    if (OpRunner.opLoggingEnabled)
    {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${message}\n`;
      try
      {
        appendFileSync(OpRunner.logFilePath, logLine);
      }
      catch (error: unknown)
      {
        console.error(`[OpRunner] Failed to write to log file: ${String(error)}`);
      }
    }
  }

  private async saveRecordedSession(filepath: string): Promise<void>
  {
    if (this.ioConfig.mode !== 'record')
    {
      this.io.logger.warn('[OpRunner] Cannot save session - not in record mode');
      return;
    }

    const recordableStdin = this.io.recordableStdin;
    if (!recordableStdin)
    {
      this.io.logger.warn('[OpRunner] Cannot save session - no recordable stdin available');
      return;
    }

    const session = await recordableStdin.saveSession(filepath);
    this.io.logger.log(`[RecordableStdin] 💾 Session saved to: ${filepath}`);
    this.io.logger.log(`[RecordableStdin] 📊 Recorded ${session.events.length} input events`);
  }

  /**
   Format current stack state for logging
   */
  private formatStack(): string
  {
    return `[${this.stack.map(op => op.name).join(', ')}]`;
  }

  /**
   Execute one step of the op stack

   Returns false when stack is empty (execution complete). Returns true when there are more ops to execute.

   Useful for testing to inspect stack state between steps.
   */
  async runStep(): Promise<boolean>
  {
    if (this.stack.length === 0)
    {
      return false; // Stack empty, execution complete
    }

    const op = this.stack[this.stack.length - 1];
    if (!op)
    {
      throw new Error('[OpRunner] Internal error: stack top is undefined');
    }

    if (OpRunner.opLoggingEnabled)
    {
      this.logToFile(`▶️  Running: ${op.name}`);
      this.logToFile(`📚 Stack depth: ${this.stack.length}`);
      this.logToFile(`📋 Stack: ${this.formatStack()}`);
      this.logToFile('');
    }

    const opStartTime = Date.now();
    const result = await op.execute();
    const opDuration = Date.now() - opStartTime;

    if (!isOutcome(result))
    {
      throw new Error(
        `[OpRunner] ${op.name}.execute() returned an invalid result (expected Outcome, got ${typeof result})`,
      );
    }

    const outcome = result;

    // Log outcome
    if (OpRunner.opLoggingEnabled)
    {
      if (outcome.ok)
      {
        this.logToFile(`✅ Completed: ${op.name} (${opDuration}ms)`);
      }
      else
      {
        this.logToFile(`❌ Failed: ${op.name} (${opDuration}ms)`);
        this.logToFile(`   Failure: ${String(outcome.failure)}`);
        if (outcome.debugData)
        {
          this.logToFile(`   Debug: ${outcome.debugData}`);
        }
      }
    }

    // Pop the completed op
    this.stack.pop();

    if (OpRunner.opLoggingEnabled)
    {
      this.logToFile(`POPPED ${op.name}`);
      this.logToFile(`Stack is now: ${this.formatStack()}`);
      if (outcome.ok && outcome.value !== undefined && outcome.value !== null)
      {
        this.logToFile(`   Value: ${JSON.stringify(outcome.value)}`);
      }
      this.logToFile('');
    }

    if (this.stack.length === 0)
    {
      this.finalOutcome = outcome as OutcomeOf<T>;
    }

    return this.stack.length > 0; // Continue if stack not empty
  }

  /**
   Run the op stack until empty.

   Execution is simple: run the top op, get its outcome, pop it. If the op needs to run children, it calls `childOp.run()` internally, which delegates to `runOutOfBand()`.
   */
  async run(): Promise<OutcomeOf<T>>
  {
    try
    {
      // Initialize log file
      if (OpRunner.opLoggingEnabled)
      {
        try
        {
          writeFileSync(OpRunner.logFilePath, ''); // Clear log file
        }
        catch (error: unknown)
        {
          console.error(`[OpRunner] Failed to initialize log file: ${String(error)}`);
        }
      }

      if (OpRunner.opLoggingEnabled)
      {
        this.logToFile('🚀 Starting execution');
        this.logToFile(`Mode: ${this.io.mode}`);
        const firstOp = this.stack[0];
        if (firstOp)
        {
          this.logToFile(`INITIAL PUSH ${firstOp.name}. Stack is now: ${this.formatStack()}`);
        }
        this.logToFile('');
      }

      // Start replay if in replay mode
      if (this.ioConfig.mode === 'replay' && this.io.replayableStdin)
      {
        this.io.replayableStdin.startReplay(500); // 500ms delay
      }

      // Execute steps until stack is empty
      while (await this.runStep())
      {
        // runStep() handles all the logic
      }

      const totalDuration = Date.now() - this.startTime;
      if (OpRunner.opLoggingEnabled)
      {
        this.logToFile('🏁 Stack empty, execution complete!');
        this.logToFile(`⏱️  Total time: ${totalDuration}ms`);
        this.logToFile('');
      }

      // FIXME: Make the session recording flush every turn so the program doesn't have to succeed to write a log

      // Save recorded session if in record mode
      if (this.ioConfig.mode === 'record' && this.io.recordableStdin && this.ioConfig.sessionFile)
      {
        await this.saveRecordedSession(this.ioConfig.sessionFile);
      }

      if (this.finalOutcome === undefined)
      {
        throw new Error('[OpRunner] Execution completed without a terminal outcome');
      }

      return this.finalOutcome;
    }
    finally
    {
      this.io.recordableStdin?.destroy();
      this.io.replayableStdin?.destroy();

      // Clear the default runner reference so that subsequent Op.run() calls create a
      // fresh runner rather than delegating to this now-finished one (which has destroyed
      // recording/replay streams and a completed lifecycle).
      if (OpRunner._default === (this as unknown))
      {
        OpRunner._default = undefined;
      }
    }
  }

  /**
   Get current stack depth (useful for debugging)
   */
  getStackDepth(): number
  {
    return this.stack.length;
  }

  /**
   Get current stack snapshot (useful for debugging)
   */
  getStackSnapshot(): string[]
  {
    return this.stack.map(op => op.name);
  }

  /**
   Get raw stack (defensive copy for advanced testing)
   */
  getStack(): ReadonlyArray<Op<unknown, unknown>>
  {
    return [...this.stack];
  }

  /**
   Save recorded session to file (only works if mode is 'record')

   @param filepath - Path to save the session file
   @returns Promise that resolves when session is saved

   @example
   ```typescript
   const runner = await OpRunner.create(myOp, { mode: 'record', sessionFile: 'session.json' });
   await runner.run();
   await runner.saveSession('session.json');
   ```
   */
  async saveSession(filepath: string): Promise<void>
  {
    await this.saveRecordedSession(filepath);
  }
}
