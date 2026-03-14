/**
 Framework-level arguments for OpRunner
 */
export type OpRunnerArgs = {
  mode: 'interactive' | 'record' | 'replay' | 'test';
  sessionFile?: string;
  logFile?: string;
};

/**
 Parse OpRunner-specific args and return remaining args for app-specific parsing

 Handles:
 - --record <file>    Record session to file
 - --replay <file>    Replay session from file
 - --log <file>       Log output to file

 @param args - Typically process.argv.slice(2) or process.argv.slice(2)
 @returns Object with opRunner config and remaining args for app
 */
export function parseOpRunnerArgs(args: string[]): {
  opRunner: OpRunnerArgs;
  remaining: string[];
}
{
  const opRunner: OpRunnerArgs = {
    mode: 'interactive',
  };

  const remaining: string[] = [];

  for (let i = 0; i < args.length; i++)
  {
    const arg = args[i];

    switch (arg)
    {
      case '--record':
      {
        const file = args[++i];
        if (!file)
        {
          throw new Error('--record requires a file path');
        }
        opRunner.mode = 'record';
        opRunner.sessionFile = file;
        break;
      }

      case '--replay':
      {
        const file = args[++i];
        if (!file)
        {
          throw new Error('--replay requires a file path');
        }
        opRunner.mode = 'replay';
        opRunner.sessionFile = file;
        break;
      }

      case '--log':
      {
        const file = args[++i];
        if (!file)
        {
          throw new Error('--log requires a file path');
        }
        opRunner.logFile = file;
        break;
      }

      default:
        // Not a framework arg, pass through to app
        if (arg !== undefined)
        {
          remaining.push(arg);
        }
        break;
    }
  }

  return { opRunner, remaining };
}
