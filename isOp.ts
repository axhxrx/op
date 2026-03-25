import { Op } from './Op.ts';

/**
 Type guard to check if a value is an Op
 */
export function isOp(value: unknown): value is Op<unknown, unknown>
{
  return value instanceof Op;
}
