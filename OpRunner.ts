import { appendFileSync, writeFileSync } from 'node:fs';
import type { OpRunnerArgs } from './args.ts';
import { type HandlerWithMeta, isHandler } from './HandlerWithMeta.ts';
import { createIOContext, type IOContext } from './IOContext.ts';
import { isOp } from './isOp.ts';
import type { Op } from './Op.ts';
import type { OpWithHandler, OutcomeOf } from './Outcome.ts';

/**
 Stack-based operation runner with full observability

 Benefits:
 - Centralized observability: ONE place where all op transitions happen
 - Log every op that runs, time every op, see full stack at any point
 - Separation of concerns: Ops describe intent, don't control execution
 - Easy to add hooks/middleware later (before/after, metrics, tracing, etc.)
 - Testing: Easier to test ops in isolation
 */
export class OpRunner<T extends Op>
{
  /**
   Enable or disable OpRunner's internal logging. Default: false
   */
  static opLoggingEnabled = false;

  /**
   Path to log file for stack mutations. Default: './op-runner-log.txt'
   */
  static logFilePath = './op-runner-log.txt';

  private stack: Array<Op | HandlerWithMeta> = []; // Single stack containing both Ops and Handlers

  private initialOp: T;
  private initialOpOutcome?: OutcomeOf<T>;
  private io: IOContext;
  private ioConfig: OpRunnerArgs;
  private startTime: number;

  private constructor(
    initialOp: T,
    ioConfig: OpRunnerArgs,
    io: IOContext,
  )
  {
    this.initialOp = initialOp;
    this.stack = [initialOp];
    this.ioConfig = ioConfig;
    this.io = io;
    this.startTime = Date.now();
  }

  protected static _default?: OpRunner<Op>;

  static get default(): OpRunner<Op> | undefined
  {
    return this._default;
  }

  static get defaultIOContext(): IOContext | undefined
  {
    return this._default?.io;
  }

  /**
   * Create an OpRunner instance (async because IO setup may be async)
   */
  static async create(initialOp: Op, ioConfig: OpRunnerArgs = { mode: 'interactive' }): Promise<OpRunner<Op>>
  {
    const io = await createIOContext(ioConfig);
    this._default = new OpRunner(initialOp, ioConfig, io);
    return this._default;
  }

  /**
   * Log to file with timestamp
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
      catch (error)
      {
        // Silently fail if we can't write to log file
        console.error(`[OpRunner] Failed to write to log file: ${String(error)}`);
      }
    }
  }

  /**
   * Format current stack state for logging
   */
  private formatStack(): string
  {
    return `[${
      this.stack.map(item =>
      {
        if (isOp(item))
        {
          return item.name;
        }
        else
        {
          return `Handler<${item.parentName}>`;
        }
      }).join(', ')
    }]`;
  }

  /**
   Execute one step of the op stack

   Returns false when stack is empty (execution complete)
   Returns true when there are more ops to execute

   Useful for testing to inspect stack state between steps
   */
  async runStep(): Promise<boolean>
  {
    if (this.stack.length === 0)
    {
      return false; // Stack empty, execution complete
    }

    const top = this.stack[this.stack.length - 1];
    if (!top)
    {
      throw new Error('[OpRunner] Internal error: stack top is undefined');
    }

    // Check if top is a handler - this should never happen at loop start
    if (isHandler(top))
    {
      throw new Error('[OpRunner] Internal error: Handler at top of stack without outcome');
    }

    // Top is an Op - run it
    const op = top;

    if (OpRunner.opLoggingEnabled)
    {
      this.logToFile(`▶️  Running: ${op.name}`);
      this.logToFile(`📚 Stack depth: ${this.stack.length}`);
      this.logToFile(`📋 Stack: ${this.formatStack()}`);
      this.logToFile('');
    }

    const opStartTime = Date.now();
    const outcome = await op.run(this.io);

    if (op === this.initialOp)
    {
      this.initialOpOutcome = outcome as OutcomeOf<T>;
    }

    const opDuration = Date.now() - opStartTime;

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

    // STEP 1: Check if this op returned a child with handler
    if (outcome.ok)
    {
      const isWrappedOp = outcome.value
        && typeof outcome.value === 'object'
        && 'op' in outcome.value
        && 'handler' in outcome.value;

      if (isWrappedOp)
      {
        // Single-stack: Replace op with handler, then push child
        const wrapped = outcome.value as OpWithHandler<Op>;
        const handlerWithMeta: HandlerWithMeta = {
          handler: wrapped.handler,
          parentName: op.name,
        };

        this.stack[this.stack.length - 1] = handlerWithMeta; // Replace op with handler
        this.stack.push(wrapped.op); // Push child

        if (OpRunner.opLoggingEnabled)
        {
          this.logToFile(`📌 Pushing: ${wrapped.op.name} (parent has outcome handler)`);
          this.logToFile(`REPLACED ${op.name} with Handler<${op.name}>`);
          this.logToFile(`PUSHED ${wrapped.op.name}`);
          this.logToFile(`Stack is now: ${this.formatStack()}`);
          this.logToFile('');
        }
        return true; // More work to do
      }

      // Check if it's a plain Op (REPLACE mode)
      const isNextOp = outcome.value
        && typeof outcome.value === 'object'
        && 'run' in outcome.value
        && 'name' in outcome.value;

      if (isNextOp)
      {
        // REPLACE current with next op
        const nextOp = outcome.value as Op;
        this.stack[this.stack.length - 1] = nextOp;

        if (OpRunner.opLoggingEnabled)
        {
          this.logToFile(`🔄 Replacing: ${op.name} → ${nextOp.name}`);
          this.logToFile(`REPLACED ${op.name} with ${nextOp.name}`);
          this.logToFile(`Stack is now: ${this.formatStack()}`);
          this.logToFile('');
        }
        return true; // More work to do
      }
    }

    // STEP 2: Op completed - pop it and check if there's a handler waiting
    this.stack.pop();

    if (OpRunner.opLoggingEnabled)
    {
      this.logToFile(`POPPED ${op.name}`);
      this.logToFile(`Stack is now: ${this.formatStack()}`);
    }

    // Check if top of stack is now a handler
    if (this.stack.length > 0)
    {
      const top = this.stack[this.stack.length - 1];
      if (top && isHandler(top))
      {
        // Call handler with outcome
        const nextOp = top.handler(outcome);

        // Replace handler with the op it returned
        this.stack[this.stack.length - 1] = nextOp;

        if (OpRunner.opLoggingEnabled)
        {
          this.logToFile(`🔄 Handler returned: ${nextOp.name}`);
          this.logToFile(`REPLACED Handler<${top.parentName}> with ${nextOp.name} (handler returned op)`);
          this.logToFile(`Stack is now: ${this.formatStack()}`);
          this.logToFile('');
        }
        return true; // More work to do
      }
    }

    // If we reach here, op completed and there was no handler
    if (OpRunner.opLoggingEnabled)
    {
      if (outcome.ok && outcome.value !== undefined && outcome.value !== null)
      {
        this.logToFile(`   Value: ${JSON.stringify(outcome.value)}`);
      }
      this.logToFile('');
    }

    return this.stack.length > 0; // Continue if stack not empty
  }

  /**
   Run the op stack until empty using single-stack architecture

   Stack execution rules:
   1. Run the top op on the stack
   2. STEP 1: If op returns OpWithHandler (child with handler):
      - REPLACE parent op with HandlerWithMeta on stack
      - PUSH child op onto stack
      - Stack becomes: [..., Handler<ParentName>, Child]
   3. STEP 1: If op returns plain Op:
      - REPLACE current op with the returned op
   4. STEP 2: When op completes (success or failure):
      - POP the completed op from stack
      - If top of stack is now a Handler:
        * Call handler(outcome)
        * REPLACE handler with the op it returns
      - Otherwise, op is done (no handler waiting)
   5. Repeat until stack is empty

   Note: Handlers must exhaustively handle all outcomes and always return an Op.
   The default handler returns `this` to re-run the parent op.
   */
  async run(): Promise<OutcomeOf<T>>
  {
    // Initialize log file
    if (OpRunner.opLoggingEnabled)
    {
      try
      {
        writeFileSync(OpRunner.logFilePath, ''); // Clear log file
      }
      catch (error)
      {
        console.error(`[OpRunner] Failed to initialize log file: ${String(error)}`);
      }
    }

    if (OpRunner.opLoggingEnabled)
    {
      this.logToFile('🚀 Starting execution');
      this.logToFile(`Mode: ${this.io.mode}`);
      const firstOp = this.stack[0];
      if (firstOp && isOp(firstOp))
      {
        this.logToFile(`INITIAL PUSH ${firstOp.name}. Stack is now: ${this.formatStack()}`);
      }
      this.logToFile('');
    }

    // Start replay if in replay mode
    // Use a longer delay to ensure Ink has time to mount and attach listeners
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
      await this.io.recordableStdin.saveSession(this.ioConfig.sessionFile);
    }

    return this.initialOpOutcome as OutcomeOf<T>;
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
    return this.stack.map(item =>
    {
      if (isOp(item))
      {
        return item.name;
      }
      else
      {
        return `Handler<${item.parentName}>`;
      }
    });
  }

  /**
   Get detailed stack snapshot with type information (useful for testing)
   */
  getStackContents(): Array<{ type: 'op' | 'handler'; name: string }>
  {
    return this.stack.map(item =>
    {
      if (isOp(item))
      {
        return { type: 'op', name: item.name };
      }
      else
      {
        return { type: 'handler', name: `Handler<${item.parentName}>` };
      }
    });
  }

  /**
   Get raw stack (defensive copy for advanced testing)
   */
  getStack(): ReadonlyArray<Op | HandlerWithMeta>
  {
    return [...this.stack];
  }

  /**
   * Save recorded session to file (only works if mode is 'record')
   *
   * @param filepath - Path to save the session file
   * @returns Promise that resolves when session is saved
   *
   * @example
   * ```typescript
   * const runner = await OpRunner.create(myOp, { mode: 'record', sessionFile: 'session.json' });
   * await runner.run();
   * await runner.saveSession('session.json');
   * ```
   */
  async saveSession(filepath: string): Promise<void>
  {
    if (this.ioConfig.mode !== 'record')
    {
      console.warn('[OpRunner] Cannot save session - not in record mode');
      return;
    }

    const recordableStdin = this.io.recordableStdin;
    if (!recordableStdin)
    {
      console.warn('[OpRunner] Cannot save session - no recordable stdin available');
      return;
    }

    await recordableStdin.saveSession(filepath);
  }
}
