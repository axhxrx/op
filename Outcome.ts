import type { Op } from './Op.ts';

/**
 A success outcome, containing a value.
 */
export interface Success<T>
{
  ok: true;
  value: T;
}

/**
 Extract the `value` from a `Success` outcome.
 */
export type UnwrapSuccess<T> = T extends Success<infer V> ? V : never;

/**
 A failure outcome, whose `failure` property indicates the type of failure.
 */
export interface Failure<T>
{
  ok: false;
  failure: T;
  debugData?: string;
}

export type UnwrapFailure<T> = T extends Failure<infer F> ? F : never;

/*
 The `Outcome` type represents the outcome of an op. An op is the fundamental unit of work, and it can either succeed, or fail.

 If the op succeeds, the `Outcome` is a `Success`, which contains the value of the op.

 If the op fails, the `Outcome` is a `Failure`, which indicates how it failed. This library is designed so that the failures can be strongly-typed and handled exhaustively.
 */
export type Outcome<SuccessT, FailureT> =
  | Success<SuccessT>
  | Failure<FailureT>;

/**
 Extract the Outcome type from an Op instance

 @example
 type MyOutcome = OutcomeOf<typeof myOp>
 */
export type OutcomeOf<T extends Op> = Awaited<ReturnType<T['run']>>;

/**
 Extract the success branch of an Op's outcome.
 */
export type SuccessOutcomeOf<T extends Op> = Extract<OutcomeOf<T>, Success<unknown>>;

/**
 Extract the failure branch of an Op's outcome.
 */
export type FailureOutcomeOf<T extends Op> = Extract<OutcomeOf<T>, Failure<unknown>>;

/**
 Handler function that receives a child Op's outcome and decides what to do next

 Handlers MUST exhaustively handle all possible outcomes and always return an Op.

 Return value:
 - Op instance: Run this op next (usually the parent `this` to re-run, or a different op)

 @example
 ```typescript
 // Re-run parent on any outcome (this is the default if handler not specified)
 (outcome) => this

 // Navigate to different op based on outcome
 (outcome) => {
   if (!outcome.ok) return this; // re-run on failure
   if (outcome.value === 'A') return new OpA();
   if (outcome.value === 'B') return new OpB();
   return this; // always return an op, never null
 }
 ```
 */
export type OutcomeHandler<OpT extends Op> = (outcome: OutcomeOf<OpT>) => Op;

/**
 Wrapper that pairs an Op with an outcome handler

 When a parent Op returns this type, OpRunner will:
 1. PUSH the child op (not replace)
 2. Keep the parent on the stack
 3. After child completes, call the handler with child's outcome
 4. Use handler's return value to decide what to do next

 This enables flexible control flow without circular dependencies.
 */
export interface OpWithHandler<OpT extends Op>
{
  op: OpT;
  handler: OutcomeHandler<OpT>;
}
