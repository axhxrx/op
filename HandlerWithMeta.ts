import type { Op } from './Op.ts';
import { OP_CONTROL, type AnyOutcome } from './Outcome.ts';

/**
 Wrapper for OutcomeHandler that includes metadata for logging
 */
export interface HandlerWithMeta
{
  [OP_CONTROL]: 'handler';
  handler: (outcome: AnyOutcome) => Op<unknown, unknown>;
  parentName: string; // Name of the op that created this handler
}

/**
 Type guard to check if a value is a HandlerWithMeta
 */
export function isHandler(value: unknown): value is HandlerWithMeta
{
  return (
    typeof value === 'object'
    && value !== null
    && OP_CONTROL in value
    && (value as Record<PropertyKey, unknown>)[OP_CONTROL] === 'handler'
  );
}
