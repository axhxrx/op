import { describe, expect, test } from 'bun:test';
import process from 'node:process';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { Outcome } from './Outcome.ts';

/**
 Debug flag for verbose logging
 Set DEBUG_OPRUNNER=true to enable detailed test output
 */
const DEBUG = process.env.DEBUG_OPRUNNER === 'true';

// =============================================================================
// TEST OPS
// =============================================================================

class SimpleOp extends Op<unknown, string>
{
  name: string;
  private value: unknown;

  constructor(name: string, value: unknown)
  {
    super();
    this.name = name;
    this.value = value;
  }

  async execute()
  {
    await Promise.resolve();
    return this.succeed(this.value);
  }
}

class FailingOp extends Op<never, string>
{
  name: string;
  private failure: string;

  constructor(name: string, failure: string)
  {
    super();
    this.name = name;
    this.failure = failure;
  }

  async execute()
  {
    await Promise.resolve();
    return this.fail(this.failure);
  }
}

/**
 An op that runs child ops via run() — the new pattern replacing handleOutcome
 */
class ParentWithChildOp extends Op<string, string>
{
  name = 'ParentWithChildOp';
  private childOp: Op<unknown, unknown>;

  constructor(childOp: Op<unknown, unknown>)
  {
    super();
    this.childOp = childOp;
  }

  async execute()
  {
    const childOutcome = await this.childOp.run();
    if (childOutcome.ok)
    {
      return this.succeed(`parent-got-${String(childOutcome.value)}`);
    }
    return this.fail(`child-failed: ${String(childOutcome.failure)}`);
  }
}

/**
 An op that runs multiple children sequentially — replacing the handleOutcome loop pattern
 */
class SequentialChildrenOp extends Op<string[], string>
{
  name = 'SequentialChildrenOp';
  private children: Op<unknown, unknown>[];

  constructor(children: Op<unknown, unknown>[])
  {
    super();
    this.children = children;
  }

  async execute()
  {
    const results: string[] = [];
    for (const child of this.children)
    {
      const outcome = await child.run();
      if (!outcome.ok)
      {
        return this.fail(`child-failed: ${String(outcome.failure)}`);
      }
      results.push(String(outcome.value));
    }
    return this.succeed(results);
  }
}

/**
 An op that loops N times — replacing the handleOutcome(() => this) loop pattern
 */
class LoopingOp extends Op<number, string>
{
  name = 'LoopingOp';
  private maxIterations: number;

  constructor(maxIterations: number)
  {
    super();
    this.maxIterations = maxIterations;
  }

  async execute()
  {
    let i = 0;
    while (i < this.maxIterations)
    {
      const child = new SimpleOp(`Iteration${i}`, i);
      const outcome = await child.run();
      if (!outcome.ok) return this.fail('iteration-failed');
      i++;
    }
    return this.succeed(i);
  }
}

/**
 An op that decides what to do based on a child's outcome — replacing handler-based routing
 */
class RoutingOp extends Op<string, string>
{
  name = 'RoutingOp';
  private childOutcomeValue: unknown;

  constructor(childOutcomeValue: unknown)
  {
    super();
    this.childOutcomeValue = childOutcomeValue;
  }

  async execute()
  {
    const child = new SimpleOp('DecisionChild', this.childOutcomeValue);
    const outcome = await child.run();

    if (!outcome.ok) return this.fail('unexpected-failure');

    // Route based on outcome value
    switch (outcome.value)
    {
      case 'A':
      {
        const opA = new SimpleOp('OpA', 'result-A');
        const aOutcome = await opA.run();
        return aOutcome.ok ? this.succeed(`routed-to-A: ${String(aOutcome.value)}`) : this.fail('A-failed');
      }
      case 'B':
      {
        const opB = new SimpleOp('OpB', 'result-B');
        const bOutcome = await opB.run();
        return bOutcome.ok ? this.succeed(`routed-to-B: ${String(bOutcome.value)}`) : this.fail('B-failed');
      }
      default:
        return this.succeed(`no-route: ${String(outcome.value)}`);
    }
  }
}

// =============================================================================
// BASIC EXECUTION TESTS
// =============================================================================

describe('Basic Execution', () =>
{
  test('Single op succeeds', async () =>
  {
    const op = new SimpleOp('SingleOp', 'done');
    const runner = await OpRunner.create(op, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({ ok: true, value: 'done' });
  });

  test('Single op fails', async () =>
  {
    const op = new FailingOp('FailingOp', 'error occurred');
    const runner = await OpRunner.create(op, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({ ok: false, failure: 'error occurred' });
  });

  test('run() returns the terminal outcome', async () =>
  {
    const op = new SimpleOp('ResultOp', 'terminal result');
    const runner = await OpRunner.create(op, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: true,
      value: 'terminal result',
    });
  });

  test('runStep returns false on empty stack', async () =>
  {
    const op = new SimpleOp('Op', 'done');
    const runner = await OpRunner.create(op, { mode: 'test' });

    // Run to completion
    await runner.run();

    // Now stack is empty, runStep should return false
    expect(await runner.runStep()).toBe(false);
  });
});

// =============================================================================
// CHILD OP EXECUTION (replaces handleOutcome tests)
// =============================================================================

describe('Child Op Execution', () =>
{
  test('Parent runs child op and gets its outcome', async () =>
  {
    const child = new SimpleOp('Child', 'child-result');
    const parent = new ParentWithChildOp(child);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: true,
      value: 'parent-got-child-result',
    });
  });

  test('Parent handles child failure', async () =>
  {
    const child = new FailingOp('Child', 'child error');
    const parent = new ParentWithChildOp(child);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: false,
      failure: 'child-failed: child error',
    });
  });

  test('Sequential children all execute', async () =>
  {
    const children = [
      new SimpleOp('Child1', 'one'),
      new SimpleOp('Child2', 'two'),
      new SimpleOp('Child3', 'three'),
    ];

    const parent = new SequentialChildrenOp(children);
    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: true,
      value: ['one', 'two', 'three'],
    });
  });

  test('Sequential children stop on failure', async () =>
  {
    const children = [
      new SimpleOp('Child1', 'one'),
      new FailingOp('Child2', 'boom'),
      new SimpleOp('Child3', 'three'), // should not execute
    ];

    const parent = new SequentialChildrenOp(children);
    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: false,
      failure: 'child-failed: boom',
    });
  });

  test('Looping op executes N iterations', async () =>
  {
    const op = new LoopingOp(5);
    const runner = await OpRunner.create(op, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({ ok: true, value: 5 });
  });

  test('Routing op branches on child outcome', async () =>
  {
    const opA = new RoutingOp('A');
    const runnerA = await OpRunner.create(opA, { mode: 'test' });
    const outcomeA = await runnerA.run();
    expect(outcomeA).toEqual({ ok: true, value: 'routed-to-A: result-A' });

    const opB = new RoutingOp('B');
    const runnerB = await OpRunner.create(opB, { mode: 'test' });
    const outcomeB = await runnerB.run();
    expect(outcomeB).toEqual({ ok: true, value: 'routed-to-B: result-B' });

    const opC = new RoutingOp('C');
    const runnerC = await OpRunner.create(opC, { mode: 'test' });
    const outcomeC = await runnerC.run();
    expect(outcomeC).toEqual({ ok: true, value: 'no-route: C' });
  });
});

// =============================================================================
// DEEP NESTING (via direct invocation)
// =============================================================================

describe('Deep Nesting', () =>
{
  test('2-level nesting: parent → child → grandchild', async () =>
  {
    const grandchild = new SimpleOp('Grandchild', 'gc-result');
    const child = new ParentWithChildOp(grandchild);
    child.name = 'Child';
    const parent = new ParentWithChildOp(child);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome).toEqual({
      ok: true,
      value: 'parent-got-parent-got-gc-result',
    });
  });

  test('Deep nesting (10 levels)', async () =>
  {
    let current: Op<unknown, unknown> = new SimpleOp('Leaf', 'leaf-value');

    for (let i = 9; i >= 0; i--)
    {
      const parent = new ParentWithChildOp(current);
      parent.name = `Level${i}`;
      current = parent;
    }

    const runner = await OpRunner.create(current, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome.ok).toBe(true);
    // The value should have "parent-got-" prepended 10 times
    if (outcome.ok)
    {
      expect(outcome.value).toBe('parent-got-'.repeat(10) + 'leaf-value');
    }
  });
});

// =============================================================================
// STACK STATE
// =============================================================================

describe('Stack State', () =>
{
  test('Empty stack after completion', async () =>
  {
    const op = new SimpleOp('Op', 'done');
    const runner = await OpRunner.create(op, { mode: 'test' });
    await runner.run();

    expect(runner.getStackDepth()).toBe(0);
    expect(runner.getStackSnapshot()).toEqual([]);
  });

  test('Stack has one item before execution', async () =>
  {
    const op = new SimpleOp('Op', 'done');
    const runner = await OpRunner.create(op, { mode: 'test' });

    expect(runner.getStackDepth()).toBe(1);
    expect(runner.getStackSnapshot()).toEqual(['Op']);
  });

  test('OpRunner.defaultIOContext is set after create()', async () =>
  {
    const op = new SimpleOp('Op', 'done');
    await OpRunner.create(op, { mode: 'test' });

    const io = OpRunner.defaultIOContext;
    expect(io).toBeDefined();
    expect(io!.mode).toBe('test');
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () =>
{
  test('Op returning invalid result throws', async () =>
  {
    const badOp = new SimpleOp('BadOp', 'ignored');
    // Override execute to return garbage
    badOp.execute = () => Promise.resolve('not a valid result' as never);

    const runner = await OpRunner.create(badOp, { mode: 'test' });
    await expect(runner.run()).rejects.toThrow('returned an invalid result');
  });

  test('Op that runs many children does not blow stack', async () =>
  {
    // 100 sequential children via direct invocation
    const children = Array.from(
      { length: 100 },
      (_, i) => new SimpleOp(`Child${i}`, i),
    );

    const parent = new SequentialChildrenOp(children);
    const runner = await OpRunner.create(parent, { mode: 'test' });
    const outcome = await runner.run();

    expect(outcome.ok).toBe(true);
    if (outcome.ok)
    {
      expect(outcome.value).toHaveLength(100);
    }
  });
});
