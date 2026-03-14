import process from 'node:process';
import { parseOpRunnerArgs } from './args.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { OutcomeOf } from './Outcome.ts';

/**
 Simple main function for apps that don't need custom arg parsing.

 For more control over arg parsing, use `init()` instead.

 @example
 ```typescript
 import { main } from '@axhxrx/op';
 import { MyRootOp } from './MyRootOp.ts';

 await main(new MyRootOp());
 ```
 */
export async function main<T extends Op>(
  getInitialOp: T | ((args: string[]) => T),
): Promise<OutcomeOf<T>>
{
  // Parse framework args first
  const { opRunner, remaining } = parseOpRunnerArgs(process.argv.slice(2));

  const initialOp = getInitialOp instanceof Op ? getInitialOp : getInitialOp(remaining);

  // Create the runner with the initial op and config (async!)
  const runner = await OpRunner.create(initialOp, opRunner);

  // Run until the stack is empty!
  const finalResult = await runner.run();

  // We are counting on OpRunner to ensure the final result is of type OutcomeOf<T>
  return finalResult as OutcomeOf<T>;
}
