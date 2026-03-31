import process from 'node:process';
import { parseOpRunnerArgs } from './args.ts';
import { createIOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { OutcomeOf } from './Outcome.ts';
import { patchConsole } from './patchConsole.ts';
import { SharedContext } from './SharedContext.ts';

/**
 Simple main function for apps that don't need custom arg parsing.

 Patches `console.log`/`warn`/`error` so output flows through the IOContext, making it compatible with TeeStream logging and other IOContext-based output capture. Consumers can just use `console.log()` and it works correctly with the framework.

 The IOContext (including TeeStream for `--log`) is created eagerly — before the op factory callback runs — so that any setup-time logging is captured.

 For more control over arg parsing, use `init()` instead.

 @example
 ```typescript
 import { main } from '@axhxrx/op';
 import { MyRootOp } from './MyRootOp.ts';

 await main(new MyRootOp());
 ```
 */
export async function main<T extends Op<unknown, unknown>>(
  getInitialOp: T | ((args: string[]) => T),
): Promise<OutcomeOf<T>>
{
  patchConsole();

  // Parse framework args first
  const { opRunner, remaining } = parseOpRunnerArgs(process.argv.slice(2));

  // Create IOContext eagerly so that logging during getInitialOp is captured by TeeStream.
  // We temporarily set it as the SharedContext override so that console.log (which is patched
  // to go through SharedContext.effectiveIOContext) writes to the right place.
  const io = await createIOContext(opRunner);
  SharedContext.overrideDefaultIOContext = io;

  try
  {
    const initialOp = getInitialOp instanceof Op ? getInitialOp : getInitialOp(remaining);

    // Clear the override — OpRunner.create() will set itself as default using this same IOContext.
    SharedContext.overrideDefaultIOContext = null;

    const runner = await OpRunner.create(initialOp, opRunner, io);
    return await runner.run();
  }
  finally
  {
    SharedContext.overrideDefaultIOContext = null;
  }
}
