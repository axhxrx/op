import type { IOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import type {
  FailureOutcomeOf,
  OutcomeOf,
  SuccessOutcomeOf,
} from './Outcome.ts';
import { PrintOp } from './PrintOp.ts';

// PrintOp has been moved to its own file: PrintOp.ts
// It's re-exported here for backwards compatibility
export { PrintOp } from './PrintOp.ts';

const _runExample = async () =>
{
  // Create an op instance
  const op = new PrintOp('Hello, world!', ['bad', 'word']);

  // TypeScript knows the return type is:
  // Promise<
  //   | Success<string>
  //   | Failure<'ProhibitedWord' | 'MessageTooLong' | 'unknownError'>
  // >
  const outcome = await op.run();

  // Exhaustive error handling with full type safety
  if (outcome.ok)
  {
    // TypeScript knows: outcome.value is string
    const val: string = outcome.value;
    console.log('Success:', val);
  }
  else
  {
    // TypeScript knows: outcome.failure is 'ProhibitedWord' | 'MessageTooLong' | 'unknownError'
    const failure: 'ProhibitedWord' | 'MessageTooLong' | 'unknownError' = outcome.failure;

    // Exhaustive matching
    switch (failure)
    {
      case 'ProhibitedWord':
        console.error('❌ Message contains prohibited words');
        break;
      case 'MessageTooLong':
        console.error('❌ Message is too long');
        break;
      case 'unknownError':
        console.error('❌ Unknown error occurred');
        break;
        // TypeScript will error if you forget a case!
    }
  }
};

// You can also extract the type for use elsewhere
type _PrintOpOutcome = OutcomeOf<PrintOp>;
// This is: Success<string> | Failure<'ProhibitedWord' | 'MessageTooLong' | 'unknownError'>

export class FetchUserOp extends Op
{
  constructor(private userId: string)
  {
    super();
  }

  get name(): string
  {
    return `FetchUserOp(${this.userId})`;
  }

  async run(_io?: IOContext)
  {
    await Promise.resolve();
    try
    {
      if (!this.userId)
      {
        return this.fail('MissingUserId' as const);
      }

      if (this.userId.length < 3)
      {
        return this.fail(
          'InvalidUserId' as const,
          `Length: ${this.userId.length}`,
        );
      }

      // Simulate fetch
      const user = {
        id: this.userId,
        name: 'John Doe',
        email: 'john@example.com',
      };

      if (!user.email)
      {
        return this.fail('EmailNotFound' as const);
      }

      return this.succeed(user);
    }
    catch (error)
    {
      return this.failWithUnknownError(String(error));
    }
  }
}

async function _anotherExample()
{
  // TypeScript infers the outcome type automatically:
  const userOp = new FetchUserOp('user123');
  const userOutcome = await userOp.run();
  // const userOutcome: Failure<"unknownError"> | Failure<"MissingUserId"> | Failure<"InvalidUserId"> | Failure<"EmailNotFound"> | Success<{
  //     id: string;
  //     name: string;
  //     email: string;
  // }>

  if (!userOutcome.ok)
  {
    // TypeScript knows all possible failures:
    // 'MissingUserId' | 'InvalidUserId' | 'EmailNotFound' | 'unknownError'
    const possibleFailures:
      | 'MissingUserId'
      | 'InvalidUserId'
      | 'EmailNotFound'
      | 'unknownError' = userOutcome.failure;

    // Exhaustive handling
    switch (possibleFailures)
    {
      case 'MissingUserId':
        console.error('User ID is required');
        break;
      case 'InvalidUserId':
        console.error('User ID is invalid');
        break;
      case 'EmailNotFound':
        console.error('User email not found');
        break;
      case 'unknownError':
        console.error('An unexpected error occurred');
        break;
    }
  }
  else
  {
    // TypeScript knows the exact shape of the success value
    const user: { id: string; name: string; email: string } = userOutcome.value;
    console.log('User:', user);
  }
}

/**
 * Functional-style pattern matching helper — not sure this is useful IRL but it's a thought
 */
export async function match<T extends Op>(
  op: T,
  handlers: {
    success: (value: SuccessOutcomeOf<T>['value']) => void;
    failure: (
      failure: FailureOutcomeOf<T>['failure'],
      debugData?: string,
    ) => void;
  },
)
{
  const outcome = await op.run();
  if (outcome.ok)
  {
    handlers.success(outcome.value);
  }
  else
  {
    handlers.failure(outcome.failure, outcome.debugData);
  }
}

async function _yetAnotherExample()
{
  //
  // Usage with pattern matching helper
  await match(new PrintOp('Hello!', []), {
    success: (message) =>
    {
      // message is inferred as string
      console.log('✅', message);
    },
    failure: (failure, debugData) =>
    {
      // failure is inferred as 'ProhibitedWord' | 'MessageTooLong' | 'unknownError'
      console.error('❌', failure, debugData);
    },
  });
}
