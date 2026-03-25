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
 A terminal outcome with unknown payload types.
 */
export type AnyOutcome = Outcome<unknown, unknown>;

/**
 Convert an Outcome type back into an Op type that produces it.
 */
export type OpWithOutcome<T extends AnyOutcome> = Op<
  UnwrapSuccess<Extract<T, Success<unknown>>>,
  UnwrapFailure<Extract<T, Failure<unknown>>>
>;

/**
 Brand used for non-terminal control-flow values returned by ops.
 */
export const OP_CONTROL = Symbol('axhxrx.op.control');

/**
 Extract the terminal Outcome type from an Op instance

 @example
 type MyOutcome = OutcomeOf<typeof myOp>
 */
export type OutcomeOf<T extends Op<unknown, unknown>> = T extends Op<
  infer SuccessT,
  infer FailureT
> ? Outcome<SuccessT, FailureT>
  : never;

/**
 Extract the success branch of an Op's outcome.
 */
export type SuccessOutcomeOf<T extends Op<unknown, unknown>> = Extract<
  OutcomeOf<T>,
  Success<unknown>
>;

/**
 Extract the failure branch of an Op's outcome.
 */
export type FailureOutcomeOf<T extends Op<unknown, unknown>> = Extract<
  OutcomeOf<T>,
  Failure<unknown>
>;

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
export type OutcomeHandler<
  OpT extends Op<unknown, unknown>,
  Out extends AnyOutcome = AnyOutcome,
> = (outcome: OutcomeOf<OpT>) => OpWithOutcome<Out>;

/**
 Explicit control-flow signal for replacing the current op.
 */
export interface ReplaceOp<Out extends AnyOutcome>
{
  [OP_CONTROL]: 'replace';
  op: OpWithOutcome<Out>;
}

/**
 Wrapper that pairs an Op with an outcome handler

 When a parent Op returns this type, OpRunner will:
 1. PUSH the child op (not replace)
 2. Keep the parent on the stack
 3. After child completes, call the handler with child's outcome
 4. Use handler's return value to decide what to do next

 This enables flexible control flow without circular dependencies.
 */
export interface OpWithHandler<
  OpT extends Op<unknown, unknown>,
  Out extends AnyOutcome = AnyOutcome,
>
{
  [OP_CONTROL]: 'child';
  op: OpT;
  handler: OutcomeHandler<OpT, Out>;
}

/**
 Any non-terminal control-flow value that can be returned by an Op.
 */
export type ControlValue<Out extends AnyOutcome> =
  | ReplaceOp<Out>
  | OpWithHandler<Op<unknown, unknown>, Out>;

/**
 Full return type of a single Op step: either a terminal outcome, or control-flow for OpRunner.
 */
export type RunResult<SuccessT, FailureT> =
  | Outcome<SuccessT, FailureT>
  | ControlValue<Outcome<SuccessT, FailureT>>;

export function isSuccess(value: unknown): value is Success<unknown>
{
  return (
    typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value as Record<string, unknown>).ok === true
    && 'value' in value
  );
}

export function isFailure(value: unknown): value is Failure<unknown>
{
  return (
    typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value as Record<string, unknown>).ok === false
    && 'failure' in value
  );
}

export function isOutcome(value: unknown): value is AnyOutcome
{
  return isSuccess(value) || isFailure(value);
}

export function isReplaceOp(value: unknown): value is ReplaceOp<AnyOutcome>
{
  return (
    typeof value === 'object'
    && value !== null
    && OP_CONTROL in value
    && (value as Record<PropertyKey, unknown>)[OP_CONTROL] === 'replace'
    && 'op' in value
  );
}

export function isOpWithHandler(value: unknown): value is OpWithHandler<Op<unknown, unknown>, AnyOutcome>
{
  return (
    typeof value === 'object'
    && value !== null
    && OP_CONTROL in value
    && (value as Record<PropertyKey, unknown>)[OP_CONTROL] === 'child'
    && 'op' in value
    && 'handler' in value
    && typeof (value as Record<string, unknown>).handler === 'function'
  );
}
