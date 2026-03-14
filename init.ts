import { type OpRunnerArgs, parseOpRunnerArgs } from './args.ts';
import type { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { OutcomeOf } from './Outcome.ts';

/**
 The result of calling `init()`. Provides everything an app needs to run ops.
 */
export type InitResult = {
  /**
   Remaining args after ops framework args (--record, --replay, --log) are extracted. Pass these to your app's own arg parser.
   */
  args: string[];

  /**
   The parsed ops framework args. Usually you don't need this, but it's here if you want to inspect what mode you're in.
   */
  opsArgs: OpRunnerArgs;

  /**
   Run your root op through the ops framework. This function captures the opsArgs in a closure, so you just pass your op and it handles the rest.
   */
  opsMain: <T extends Op>(initialOp: T) => Promise<OutcomeOf<T>>;
};

/**
 Initialize the ops framework from CLI args.

 Separates ops-specific args (--record, --replay, --log) from your app's args, and returns a pre-configured `opsMain` function that you call with your root op.

 @example
 ```typescript
 import { init } from '@axhxrx/ops';

 const { args, opsMain } = init(Deno.args);

 // Parse your own args however you want
 const myConfig = parseMyArgs(args);

 // Create and run your root op
 const outcome = await opsMain(new MyRootOp(myConfig));

 if (!outcome.ok)
 {
   console.error(`Failed: ${outcome.failure}`);
   Deno.exit(1);
 }
 ```

 @param rawArgs - The raw CLI args, typically `Deno.args` or `process.argv.slice(2)`
 @returns An object with remaining args, parsed ops args, and the opsMain runner function
 */
export function init(rawArgs: string[]): InitResult
{
  const { opRunner, remaining } = parseOpRunnerArgs(rawArgs);

  async function opsMain<T extends Op>(initialOp: T): Promise<OutcomeOf<T>>
  {
    const runner = await OpRunner.create(initialOp, opRunner);
    const finalResult = await runner.run();
    return finalResult as OutcomeOf<T>;
  }

  return {
    args: remaining,
    opsArgs: opRunner,
    opsMain,
  };
}
