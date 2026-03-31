import type { IOContext } from './IOContext.ts';
import { OpRunner } from './OpRunner.ts';
import {
  type Failure,
  OP_CONTROL,
  type OpWithHandler,
  type Outcome,
  type OutcomeHandler,
  type OutcomeOf,
  type ReplaceOp,
  type RunResult,
  type Success,
} from './Outcome.ts';
import { SharedContext } from './SharedContext.ts';

/**
 Abstract base class for ops.

 Ops should use `console.log()`, `console.warn()`, and `console.error()` for output. When the framework is initialized via `main()` or `init()`, console is monkey-patched to flow through the IOContext, making output compatible with TeeStream logging and other IO capture.

 For ops that need raw stream access (e.g., reading from stdin), use `this.io` to get the effective IOContext.
 */
export abstract class Op<SuccessT = unknown, FailureT = unknown>
{
  /**
   The `static` variant of `run()` creates an instance of the op and executes it through OpRunner.

   If a default OpRunner already exists (i.e., the app was started via `main()` or `init()`), the op is run out-of-band on the default runner's temporary stack, sharing the program's IOContext. This means all output flows to the same TeeStream/log file regardless of which stack produced it. The IOContext is program-scoped, not stack-scoped.

   If no default runner exists, one is created (making this the program's primary runner).

   This method is reentrant — ops running out-of-band can themselves call `Op.run()`.
   */
  // (This type-fu avoids the `Cannot create an instance of an abstract class` error.)
  public static async run<ThisT extends new(...args: never[]) => Op<unknown, unknown>>(
    this: ThisT,
    ...args: ConstructorParameters<ThisT>
  ): Promise<OutcomeOf<InstanceType<ThisT>>>
  {
    const op = new this(...args) as InstanceType<ThisT>;
    const defaultRunner = OpRunner.default;

    if (defaultRunner)
    {
      return await defaultRunner.runOutOfBand(op) as OutcomeOf<InstanceType<ThisT>>;
    }

    // No existing default — first runner for this program.
    const runner = await OpRunner.create(op);
    return await runner.run();
  }

  abstract name: string;

  abstract run(): Promise<RunResult<SuccessT, FailureT>>;

  /**
   Returns the effective IOContext, falling back to process `stdin`, `stdout`, and `stderr` streams if no OpRunner has been created yet.

   Most ops don't need this — just use `console.log()` for output. This getter is for ops that need raw stream access, such as reading from stdin or writing binary data.
   */
  protected get io(): IOContext
  {
    return SharedContext.effectiveIOContext;
  }

  /**
   Helper to create a success outcome

   @param value - The success value
   */
  protected succeed<T>(value: T): Success<T>
  {
    return { ok: true, value };
  }

  /**
   Helper to explicitly replace the current op with another op that has the same terminal outcome type.

   This is the explicit control-flow equivalent of the old `return this.succeed(nextOp)` pattern.
   It keeps terminal outcomes and control-flow values separate.
   */
  protected replaceWith(nextOp: Op<SuccessT, FailureT>): ReplaceOp<Outcome<SuccessT, FailureT>>
  {
    return {
      [OP_CONTROL]: 'replace',
      op: nextOp,
    };
  }

  /**
   Helper to suspend the current op, run a child, and resume via a handler.

   The handler receives the child's terminal outcome and must return an op with the same terminal outcome type as the parent.

   @param op - The child Op to run
   @param handler - Function that receives child's outcome and decides what to do

   @example
   ```typescript
   // Re-run parent when child completes (default behavior)
   return this.handleOutcome(new FileOperationsMenuOp());

   // Navigate to different op after child
   return this.handleOutcome(
     new ConfirmOp('Delete?'),
     (outcome) => {
       if (outcome.ok && outcome.value === true) {
         return new DeleteOp();
       }
       return this; // Ask again
     }
   );

   return this.handleOutcome(
     new SelectFromListOp(['A', 'B', 'Back']),
     (outcome) => {
       if (!outcome.ok) return this; // re-run on cancel
       if (outcome.value === 'Back') return this;
       if (outcome.value === 'A') return new OpA();
       return new OpB();
     }
   );
   ```
   */
  protected handleOutcome<OpT extends Op<unknown, unknown>>(
    op: OpT,
    handler?: OutcomeHandler<OpT, Outcome<SuccessT, FailureT>>,
  ): OpWithHandler<OpT, Outcome<SuccessT, FailureT>>
  {
    const defaultHandler = (_outcome: OutcomeOf<OpT>): Op<SuccessT, FailureT> => this;
    return {
      [OP_CONTROL]: 'child',
      op,
      handler: handler ?? defaultHandler,
    };
  }

  /**
   Helper to create a failure outcome.

   UPDATE: @masonmark 2026-01-11: If your `run()` method has an explicit return type (e.g., `Promise<Success<T> | Failure<MyFailureType>>`), then `as const` is unnecessary — TypeScript uses contextual typing to infer the correct literal type. Only use `as const` if you're relying on inferred return types (not recommended).

   Original note (for inferred return types): don't forget to use `as const` to preserve literal type of `failure` or you will lose strong exhaustive typing of the possible failures.
   */
  protected fail<F>(failure: F, debugData?: string): Failure<F>
  {
    return { ok: false, failure, debugData };
  }

  /**
   The error of last resort
   */
  protected failWithUnknownError(debugData?: string): Failure<'unknownError'>
  {
    return { ok: false, failure: 'unknownError', debugData };
  }

  /**
   Standard cancellation helper - use when user explicitly cancels an operation. That's just a somewhat special case of failure.

   Not all ops should be cancelable; it should be configurable.

   Common cancellation triggers:
   - User presses Escape key in interactive components (opt-in via `cancelable` option)
   - User sends interrupt signal (Ctrl+C is handled by framework)
   - Operation times out (if implementing timeout logic)
   */
  protected cancel(): Failure<'canceled'>
  {
    return { ok: false, failure: 'canceled' };
  }
}
