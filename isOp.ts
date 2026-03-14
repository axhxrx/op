import type { Op } from './Op.ts';

/**
 Type guard to check if a value is an Op

 Ops must have an run() method that returns a Promise
 */
export function isOp(value: unknown): value is Op
{
  return (
    value !== null
    && value !== undefined
    && typeof value === 'object'
    && 'run' in value
    && typeof (value as Record<string, unknown>).run === 'function'
    && 'name' in value
    && typeof (value as Record<string, unknown>).name === 'string'
  );
}
