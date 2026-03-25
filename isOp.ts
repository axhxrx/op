import { Op } from './Op.ts';

/**
 Type guard to check if a value is an Op

 Ops must have an run() method that returns a Promise
 */
export function isOp(value: unknown): value is Op<unknown, unknown>
{
  return value instanceof Op;
}
