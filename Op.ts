import type { IOContext } from './IOContext.ts';
import { OpRunner } from './OpRunner.ts';
import type {
  Failure,
  Outcome,
  OutcomeOf,
  Success,
} from './Outcome.ts';
import { SharedContext } from './SharedContext.ts';

/**
 Abstract base class for ops.

 Subclasses implement `execute()` to define the op's behavior. Callers invoke `run()` (or the static `Op.run()`) to execute the op through the OpRunner, which provides IOContext, logging, and session recording/replay.

 Ops should use `console.log()`, `console.warn()`, and `console.error()` for output. When the framework is initialized via `main()` or `init()`, console is monkey-patched to flow through the IOContext, making output compatible with TeeStream logging and other IO capture.

 For ops that need raw stream access (e.g., reading from stdin), use `this.io` to get the effective IOContext.

 To run child ops from within `execute()`, just call `await childOp.run()` or `await ChildOp.run(...)`. The child will execute through the OpRunner automatically.
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
    return await op.run() as OutcomeOf<InstanceType<ThisT>>;
  }

  abstract name: string;

  /**
   The implementation of this op's behavior. Subclasses override this method.

   Returns a terminal `Outcome` — either a success or failure. To run child ops, call `await childOp.run()` within this method; the child will execute through the OpRunner automatically.

   This method is called by the OpRunner. Do not call it directly — use `run()` instead.
   */
  abstract execute(): Promise<Outcome<SuccessT, FailureT>>;

  /**
   Run this op through the OpRunner.

   If a default OpRunner already exists, the op is run out-of-band on the default runner's temporary stack, sharing the program's IOContext.

   If no default runner exists, one is created (making this the program's primary runner).

   This method is reentrant — ops running via `run()` can themselves call `run()` on child ops.
   */
  async run(): Promise<Outcome<SuccessT, FailureT>>
  {
    const defaultRunner = OpRunner.default;

    if (defaultRunner)
    {
      return await defaultRunner.runOutOfBand(this) as Outcome<SuccessT, FailureT>;
    }

    // No existing default — first runner for this program.
    const runner = await OpRunner.create(this);
    return await runner.run();
  }

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
