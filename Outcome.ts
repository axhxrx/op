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

/**
 Extract the `failure` from a `Failure` outcome.
 */
export type UnwrapFailure<T> = T extends Failure<infer F> ? F : never;

/**
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
 Type guard that checks whether a value is a `Success` outcome.
 */
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

/**
 Type guard that checks whether a value is a `Failure` outcome.
 */
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

/**
 Type guard that checks whether a value is any `Outcome` (either `Success` or `Failure`).
 */
export function isOutcome(value: unknown): value is AnyOutcome
{
  return isSuccess(value) || isFailure(value);
}
