# @axhxrx/op

Minimal, zero-dependency core of the Ops Pattern — a composable, generally stack-based architecture for TypeScript applications where every action is an Op.

## What's an Op?

An Op is a unit of work that returns a strongly-typed `Outcome<SuccessT, FailureT>`. By default, Ops compose via a stack-based runner, support record/replay of interactive sessions, and are independently testable. (They can also be organized in other ways, e.g. direct invocation, without using the OpRunner; they are essentially just functions, but with more constraints on how they can be defined.)

```typescript
import { Op, type IOContext } from "@axhxrx/op";

class GreetOp extends Op {
  name = "GreetOp";

  constructor(private who: string) {
    super();
  }

  async run() {
    if (!this.who) {
      return this.fail("NoName" as const);
    }
    return this.succeed(`Hello, ${this.who}!`);
  }
}

const outcome = await GreetOp.run("world");
if (outcome.ok) {
  console.log(outcome.value); // "Hello, world!"
}
```

Failures are exhaustively checkable:

```typescript
if (!outcome.ok) {
  switch (outcome.failure) {
    case "NoName":
      /* handle */ break;
    // TypeScript errors if you miss a case
  }
}
```

## Core Concepts

- **Op** — abstract base class; implement `name` and `run()`
- **Outcome** — `Success<T> | Failure<F>`, the universal return type
- **OpRunner** — stack-based executor with logging and observability
- **IOContext** — injectable stdin/stdout with record/replay modes
- **RecordableStdin / ReplayableStdin** — capture and replay interactive sessions for deterministic testing

## Usage

```typescript
import { init } from "@axhxrx/op";

const args = process.argv.slice(2);
const { args, opsMain } = init(args); // or
const outcome = await opsMain(new MyRootOp(args));
```

Record a session: `./my-app --record session.json`
Replay it: `./my-app --replay session.json`

## Runtime

Works with Deno and No runtime dependencies.
