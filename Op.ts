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
 */
export abstract class Op<SuccessT = unknown, FailureT = unknown>
{
  /**
   The `static` variant of `run()` creates an instance of the op and executes it through OpRunner.

   This type-fu avoids the `Cannot create an instance of an abstract class` error.
   */
  public static async run<ThisT extends new(...args: never[]) => Op<unknown, unknown>>(
    this: ThisT,
    ...args: ConstructorParameters<ThisT>
  ): Promise<OutcomeOf<InstanceType<ThisT>>>
  {
    const op = new this(...args) as InstanceType<ThisT>;
    const runner = await OpRunner.create(op);
    return await runner.run();
  }

  abstract name: string;

  /**
   @deprecated The `io` parameter will be removed in a future version. Ops should access the IOContext via `this.getIO()` (no args) instead. OpRunner sets `OpRunner.defaultIOContext` automatically, so the explicit parameter is redundant during normal execution.
   */
  abstract run(io?: IOContext): Promise<RunResult<SuccessT, FailureT>>;

  /**
   Returns the default IOContext, if it exists, falling back to process `stdin`, `stdout, and `stderr` streams if not.

   NOTE: This replaces the deprecated getIO() method, but it does not know anything about to to-be-removed `io` parameter of `Op`'s `run()` method. It is the responsibility of the caller to migrate from `getIO(io)` to `this.io` and ensure that `OpRunner.defaultIOContext` is set appropriately.
   */
  protected get io(): IOContext
  {
    return SharedContext.effectiveIOContext;
  }

  /**
   Get IO context, defaulting to process streams if not provided.

   @deprecated The `io` parameter will be removed in a future version. Use `this.io` with no arguments instead — but note the behavioral difference, if you are migrating old code that uses the `io` parameter.
   */
  protected getIO(io?: IOContext): IOContext
  {
    return io ?? this.io;
  }

  /**
   Convenience method for logging from ops. Uses the logger from IOContext.

   @deprecated The `io` parameter will be removed in a future version. Use `this.log(message)` instead.

   @example
   ```typescript
   class MyOp extends Op {
     async run() {
       this.log('Starting operation...');
       return this.succeed(result);
     }
   }
   ```
   */
  protected log(io: IOContext | undefined, message: string): void;
  protected log(message: string): void;
  protected log(ioOrMessage: IOContext | undefined | string, message?: string): void
  {
    if (typeof ioOrMessage === 'string')
    {
      this.getIO().logger.log(ioOrMessage);
    }
    else
    {
      this.getIO(ioOrMessage).logger.log(message!);
    }
  }

  /**
   Convenience method for warning from ops.

   @deprecated The `io` parameter will be removed in a future version. Use `this.warn(message)` instead.
   */
  protected warn(io: IOContext | undefined, message: string): void;
  protected warn(message: string): void;
  protected warn(ioOrMessage: IOContext | undefined | string, message?: string): void
  {
    if (typeof ioOrMessage === 'string')
    {
      this.getIO().logger.warn(ioOrMessage);
    }
    else
    {
      this.getIO(ioOrMessage).logger.warn(message!);
    }
  }

  /**
   Convenience method for errors from ops.

   @deprecated The `io` parameter will be removed in a future version. Use `this.error(message)` instead.
   */
  protected error(io: IOContext | undefined, message: string): void;
  protected error(message: string): void;
  protected error(ioOrMessage: IOContext | undefined | string, message?: string): void
  {
    if (typeof ioOrMessage === 'string')
    {
      this.getIO().logger.error(ioOrMessage);
    }
    else
    {
      this.getIO(ioOrMessage).logger.error(message!);
    }
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
      handler: handler || defaultHandler,
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
