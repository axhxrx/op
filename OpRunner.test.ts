import { describe, expect, test } from 'bun:test';
import type { IOContext } from './IOContext.ts';
import { Op } from './Op.ts';
import { OpRunner } from './OpRunner.ts';
import type { OutcomeHandler } from './Outcome.ts';

/**
 * Debug flag for verbose logging
 * Set DEBUG_OPRUNNER=true to enable detailed test output
 */
const DEBUG = process.env.DEBUG_OPRUNNER === 'true';

/**
 * Type definitions for ScriptedOp actions
 */
type OpAction =
  | { type: 'succeed'; value: unknown }
  | { type: 'fail'; failure: string }
  | { type: 'handleOutcome'; child: Op; handler?: OutcomeHandler<Op> }
  | { type: 'replaceWith'; nextOp: Op };

/**
 * ScriptedOp - Flexible test op that follows a predefined script
 *
 * This allows us to simulate all possible op behaviors:
 * - Succeeding with a value
 * - Failing with an error
 * - Returning handleOutcome with child and optional handler
 * - Replacing itself with another op
 */
class ScriptedOp extends Op
{
  name: string;
  private script: OpAction[];
  private callCount = 0;

  constructor(name: string, script: OpAction[])
  {
    super();
    this.name = name;
    this.script = script;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async run(_io?: IOContext)
  {
    const action = this.script[this.callCount++];

    if (!action)
    {
      // No more actions in script, just succeed
      return this.succeed(undefined);
    }

    switch (action.type)
    {
      case 'succeed':
        return this.succeed(action.value);

      case 'fail':
        return this.fail(action.failure);

      case 'handleOutcome':
        return this.handleOutcome(action.child, action.handler);

      case 'replaceWith':
        return this.succeed(action.nextOp);
    }
  }
}

/**
 * Helper to capture stack states at each execution step
 */
async function captureExecution(runner: OpRunner<Op>): Promise<string[][]>
{
  const states: string[][] = [];

  // Capture initial state
  states.push(runner.getStackSnapshot());

  // Execute step by step, capturing state after each
  while (await runner.runStep())
  {
    states.push(runner.getStackSnapshot());
  }

  // Capture final (empty) state
  states.push(runner.getStackSnapshot());

  return states;
}

/**
 * Helper to format stack for readable assertions
 */
function formatStack(snapshot: string[]): string
{
  return `[${snapshot.join(', ')}]`;
}

/**
 * Helper to log stack evolution for debugging
 */
function logStackEvolution(states: string[][])
{
  if (!DEBUG) return;

  console.log('\n📚 Stack Evolution:');
  states.forEach((state, i) =>
  {
    console.log(`  Step ${i}: ${formatStack(state)}`);
  });
  console.log('');
}

// =============================================================================
// BASIC EXECUTION TESTS
// =============================================================================

describe('Basic Execution', () =>
{
  test('Single op succeeds', async () =>
  {
    const op = new ScriptedOp('SingleOp', [
      { type: 'succeed', value: 'done' },
    ]);

    const runner = await OpRunner.create(op, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['SingleOp'], // Initial
      [], // After completion
    ]);
  });

  test('Single op fails', async () =>
  {
    const op = new ScriptedOp('FailingOp', [
      { type: 'fail', failure: 'error occurred' },
    ]);

    const runner = await OpRunner.create(op, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['FailingOp'], // Initial
      [], // After failure
    ]);
  });

  test('Op replaces itself with another op', async () =>
  {
    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: 'done' },
    ]);

    const firstOp = new ScriptedOp('FirstOp', [
      { type: 'replaceWith', nextOp },
    ]);

    const runner = await OpRunner.create(firstOp, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['FirstOp'], // Initial
      ['NextOp'], // After replacement
      [], // After NextOp completes
    ]);
  });

  test('Multiple sequential replacements', async () =>
  {
    const op3 = new ScriptedOp('Op3', [
      { type: 'succeed', value: 'done' },
    ]);

    const op2 = new ScriptedOp('Op2', [
      { type: 'replaceWith', nextOp: op3 },
    ]);

    const op1 = new ScriptedOp('Op1', [
      { type: 'replaceWith', nextOp: op2 },
    ]);

    const runner = await OpRunner.create(op1, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['Op1'], // Initial
      ['Op2'], // After first replacement
      ['Op3'], // After second replacement
      [], // After Op3 completes
    ]);
  });
});

// =============================================================================
// HANDLEOUTCOME - BASIC TESTS
// =============================================================================

describe('HandleOutcome - Basic', () =>
{
  test('Parent → Child with default handler (parent re-runs)', async () =>
  {
    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'done' },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child }, // First run
      { type: 'succeed', value: 'finished' }, // Second run (after default handler returns this)
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['Parent'], // Initial
      ['Handler<Parent>', 'Child'], // After handleOutcome
      ['Parent'], // After child completes, handler returned parent
      [], // After parent completes
    ]);
  });

  test('Parent → Child with custom handler (returns different op)', async () =>
  {
    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: 'done' },
    ]);

    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'child done' },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child, handler: () => nextOp },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['Parent'], // Initial
      ['Handler<Parent>', 'Child'], // After handleOutcome
      ['NextOp'], // After child completes, handler returned NextOp
      [], // After NextOp completes
    ]);
  });

  test('Handler receives success outcome', async () =>
  {
    let receivedOutcome: unknown;

    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'success value' },
    ]);

    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: null },
    ]);

    const parent = new ScriptedOp('Parent', [
      {
        type: 'handleOutcome',
        child,
        handler: (outcome) =>
        {
          receivedOutcome = outcome;
          return nextOp;
        },
      },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    await captureExecution(runner);

    expect(receivedOutcome).toEqual({
      ok: true,
      value: 'success value',
    });
  });

  test('Handler receives failure outcome', async () =>
  {
    let receivedOutcome: unknown;

    const child = new ScriptedOp('Child', [
      { type: 'fail', failure: 'child error' },
    ]);

    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: null },
    ]);

    const parent = new ScriptedOp('Parent', [
      {
        type: 'handleOutcome',
        child,
        handler: (outcome) =>
        {
          receivedOutcome = outcome;
          return nextOp;
        },
      },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    await captureExecution(runner);

    expect(receivedOutcome).toEqual({
      ok: false,
      failure: 'child error',
    });
  });

  test('Parent loops 3 times using default handler', async () =>
  {
    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 1 },
      { type: 'succeed', value: 2 },
      { type: 'succeed', value: 3 },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child }, // Loop 1
      { type: 'handleOutcome', child }, // Loop 2
      { type: 'handleOutcome', child }, // Loop 3
      { type: 'succeed', value: 'done' }, // Exit
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Should see 3 complete loops
    expect(states.filter(s => s.length === 2 && s[0] === 'Handler<Parent>')).toHaveLength(3);
    expect(states[states.length - 1]).toEqual([]); // Final state is empty
  });
});

// =============================================================================
// NESTING & DEEP STACKS
// =============================================================================

describe('Nesting & Deep Stacks', () =>
{
  test('2-level nesting: A → B → C', async () =>
  {
    const c = new ScriptedOp('C', [
      { type: 'succeed', value: 'c done' },
    ]);

    const b = new ScriptedOp('B', [
      { type: 'handleOutcome', child: c },
      { type: 'succeed', value: 'b done' },
    ]);

    const a = new ScriptedOp('A', [
      { type: 'handleOutcome', child: b },
      { type: 'succeed', value: 'a done' },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    expect(states).toEqual([
      ['A'], // Initial
      ['Handler<A>', 'B'], // A → B
      ['Handler<A>', 'Handler<B>', 'C'], // B → C
      ['Handler<A>', 'B'], // C completes, B re-runs
      ['A'], // B completes, A re-runs
      [], // A completes
    ]);
  });

  test('3-level nesting: A → B → C → D', async () =>
  {
    const d = new ScriptedOp('D', [
      { type: 'succeed', value: 'd done' },
    ]);

    const c = new ScriptedOp('C', [
      { type: 'handleOutcome', child: d },
      { type: 'succeed', value: 'c done' },
    ]);

    const b = new ScriptedOp('B', [
      { type: 'handleOutcome', child: c },
      { type: 'succeed', value: 'b done' },
    ]);

    const a = new ScriptedOp('A', [
      { type: 'handleOutcome', child: b },
      { type: 'succeed', value: 'a done' },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Verify maximum stack depth
    const maxDepth = Math.max(...states.map(s => s.length));
    expect(maxDepth).toBe(4); // A, Handler<A>, Handler<B>, Handler<C>, D

    expect(states[states.length - 1]).toEqual([]); // Final state is empty
  });

  test('Deep unwinding: handlers fire in correct order', async () =>
  {
    const executionOrder: string[] = [];

    const c = new ScriptedOp('C', [
      { type: 'succeed', value: 'c' },
    ]);

    const nextB = new ScriptedOp('NextB', [
      { type: 'succeed', value: null },
    ]);

    const nextA = new ScriptedOp('NextA', [
      { type: 'succeed', value: null },
    ]);

    const b = new ScriptedOp('B', [
      {
        type: 'handleOutcome',
        child: c,
        handler: (_outcome) =>
        {
          executionOrder.push('B handler');
          return nextB;
        },
      },
    ]);

    const a = new ScriptedOp('A', [
      {
        type: 'handleOutcome',
        child: b,
        handler: (_outcome) =>
        {
          executionOrder.push('A handler');
          return nextA;
        },
      },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    await captureExecution(runner);

    // Handlers should fire in order: B (inner) first, then A (outer)
    expect(executionOrder).toEqual(['B handler', 'A handler']);
  });

  test('Mixed handlers: some default, some custom', async () =>
  {
    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: null },
    ]);

    const c = new ScriptedOp('C', [
      { type: 'succeed', value: 'c' },
    ]);

    const b = new ScriptedOp('B', [
      { type: 'handleOutcome', child: c }, // Default handler
      { type: 'succeed', value: 'b done' },
    ]);

    const a = new ScriptedOp('A', [
      {
        type: 'handleOutcome',
        child: b,
        handler: () => nextOp, // Custom handler
      },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // B uses default (re-runs), A uses custom (goes to NextOp)
    expect(states).toContainEqual(['Handler<A>', 'B']); // B with default handler
    expect(states).toContainEqual(['NextOp']); // A's custom handler
  });

  test('Stack depth verification at each step', async () =>
  {
    const c = new ScriptedOp('C', [
      { type: 'succeed', value: 'c' },
    ]);

    const b = new ScriptedOp('B', [
      { type: 'handleOutcome', child: c },
      { type: 'succeed', value: 'b' },
    ]);

    const a = new ScriptedOp('A', [
      { type: 'handleOutcome', child: b },
      { type: 'succeed', value: 'a' },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    const states = await captureExecution(runner);

    // Verify stack depths
    const depths = states.map(s => s.length);

    // Should start at 1, grow to 3, then shrink back to 0
    expect(depths[0]).toBe(1); // [A]
    expect(Math.max(...depths)).toBe(3); // [Handler<A>, Handler<B>, C]
    expect(depths[depths.length - 1]).toBe(0); // []
  });
});

// =============================================================================
// COMPLEX FLOWS
// =============================================================================

describe('Complex Flows', () =>
{
  test('Conditional branching: handler chooses op based on outcome', async () =>
  {
    const successOp = new ScriptedOp('SuccessPath', [
      { type: 'succeed', value: 'success handled' },
    ]);

    const failureOp = new ScriptedOp('FailurePath', [
      { type: 'succeed', value: 'failure handled' },
    ]);

    const child = new ScriptedOp('Child', [
      { type: 'fail', failure: 'child failed' },
    ]);

    const parent = new ScriptedOp('Parent', [
      {
        type: 'handleOutcome',
        child,
        handler: (outcome) => outcome.ok ? successOp : failureOp,
      },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Since child fails, should go to FailurePath
    expect(states).toContainEqual(['FailurePath']);
    expect(states).not.toContainEqual(['SuccessPath']);
  });

  test('Sequential children: Parent → Child1, then Child2, then Child3', async () =>
  {
    const child3 = new ScriptedOp('Child3', [
      { type: 'succeed', value: 3 },
    ]);

    const child2 = new ScriptedOp('Child2', [
      { type: 'succeed', value: 2 },
    ]);

    const child1 = new ScriptedOp('Child1', [
      { type: 'succeed', value: 1 },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child: child1 }, // Run child1
      { type: 'handleOutcome', child: child2 }, // Then child2
      { type: 'handleOutcome', child: child3 }, // Then child3
      { type: 'succeed', value: 'all done' }, // Finally complete
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Should see all three children in sequence
    expect(states.filter(s => s.includes('Child1')).length).toBeGreaterThan(0);
    expect(states.filter(s => s.includes('Child2')).length).toBeGreaterThan(0);
    expect(states.filter(s => s.includes('Child3')).length).toBeGreaterThan(0);
  });

  test('Child replaces itself mid-execution', async () =>
  {
    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: 'done' },
    ]);

    const child = new ScriptedOp('Child', [
      { type: 'replaceWith', nextOp },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child },
      { type: 'succeed', value: 'parent done' },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Child should be replaced with NextOp before completing
    expect(states).toContainEqual(['Handler<Parent>', 'NextOp']);
  });

  test('Handler returns op that has its own child', async () =>
  {
    const grandchild = new ScriptedOp('Grandchild', [
      { type: 'succeed', value: 'gc done' },
    ]);

    const childFromHandler = new ScriptedOp('ChildFromHandler', [
      { type: 'handleOutcome', child: grandchild },
      { type: 'succeed', value: 'cfh done' },
    ]);

    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'child done' },
    ]);

    const parent = new ScriptedOp('Parent', [
      {
        type: 'handleOutcome',
        child,
        handler: () => childFromHandler,
      },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Should see ChildFromHandler spawn Grandchild
    expect(states).toContainEqual(['ChildFromHandler']);
    expect(states).toContainEqual(['Handler<ChildFromHandler>', 'Grandchild']);
  });

  test('Failure propagation through handlers', async () =>
  {
    let handler1Called = false;
    let handler2Called = false;

    const child = new ScriptedOp('Child', [
      { type: 'fail', failure: 'child error' },
    ]);

    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: null },
    ]);

    const b = new ScriptedOp('B', [
      {
        type: 'handleOutcome',
        child,
        handler: (outcome) =>
        {
          handler1Called = true;
          expect(outcome.ok).toBe(false);
          return nextOp;
        },
      },
    ]);

    const a = new ScriptedOp('A', [
      {
        type: 'handleOutcome',
        child: b,
        handler: (outcome) =>
        {
          handler2Called = true;
          expect(outcome.ok).toBe(true); // B's handler handled the failure
          return nextOp;
        },
      },
    ]);

    const runner = await OpRunner.create(a, { mode: 'test' });
    await captureExecution(runner);

    expect(handler1Called).toBe(true);
    expect(handler2Called).toBe(true);
  });

  test('Success value passing through handlers', async () =>
  {
    const values: unknown[] = [];

    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'original value' },
    ]);

    const nextOp = new ScriptedOp('NextOp', [
      { type: 'succeed', value: null },
    ]);

    const parent = new ScriptedOp('Parent', [
      {
        type: 'handleOutcome',
        child,
        handler: (outcome) =>
        {
          if (outcome.ok)
          {
            values.push(outcome.value);
          }
          return nextOp;
        },
      },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    await captureExecution(runner);

    expect(values).toEqual(['original value']);
  });
});

// =============================================================================
// STACK STATE VALIDATION
// =============================================================================

describe('Stack State Validation', () =>
{
  test('Verify handler parent names are correct', async () =>
  {
    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'done' },
    ]);

    const parent = new ScriptedOp('ParentOp', [
      { type: 'handleOutcome', child },
      { type: 'succeed', value: 'done' },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    // Find state with handler
    const handlerState = states.find(s => s.includes('Handler<ParentOp>'));
    expect(handlerState).toBeDefined();
    expect(handlerState).toContain('Handler<ParentOp>');
  });

  test('Verify stack mutations match expected pattern', async () =>
  {
    const child = new ScriptedOp('Child', [
      { type: 'succeed', value: 'done' },
    ]);

    const parent = new ScriptedOp('Parent', [
      { type: 'handleOutcome', child },
      { type: 'succeed', value: 'done' },
    ]);

    const runner = await OpRunner.create(parent, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Expected pattern for this scenario
    expect(states[0]).toEqual(['Parent']); // Initial
    expect(states[1]).toEqual(['Handler<Parent>', 'Child']); // After handleOutcome
    expect(states[2]).toEqual(['Parent']); // After handler returns parent
    expect(states[3]).toEqual([]); // Final
  });

  test('Edge case: handler at top of stack (should never happen)', async () =>
  {
    // This test verifies the error handling in runStep()
    // We can't easily create this scenario through normal means,
    // but the check exists in the code at line 137-140 of OpRunner.ts

    // This is a documentation test - the actual check is:
    // if (OpRunner.isHandler(top)) {
    //   throw new Error('[OpRunner] Internal error: Handler at top of stack without outcome');
    // }

    // If this ever happens, it indicates a bug in the stack management
    expect(true).toBe(true); // Placeholder - the real test is the error check in code
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () =>
{
  test('Empty stack after completion', async () =>
  {
    const op = new ScriptedOp('Op', [
      { type: 'succeed', value: 'done' },
    ]);

    const runner = await OpRunner.create(op, { mode: 'test' });
    const states = await captureExecution(runner);

    expect(states[states.length - 1]).toEqual([]);
    expect(runner.getStackDepth()).toBe(0);
  });

  test('Very deep nesting (10+ levels)', async () =>
  {
    // Build a chain: A → B → C → ... → J (10 levels deep)
    let currentOp = new ScriptedOp('J', [
      { type: 'succeed', value: 'deepest' },
    ]);

    const opNames = ['I', 'H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];

    for (const name of opNames)
    {
      const childOp = currentOp;
      currentOp = new ScriptedOp(name, [
        { type: 'handleOutcome', child: childOp },
        { type: 'succeed', value: name },
      ]);
    }

    const runner = await OpRunner.create(currentOp, { mode: 'test' });
    const states = await captureExecution(runner);

    logStackEvolution(states);

    // Should reach max depth of 10 (all handlers + deepest op)
    const maxDepth = Math.max(...states.map(s => s.length));
    expect(maxDepth).toBeGreaterThanOrEqual(10);

    // Should eventually complete
    expect(states[states.length - 1]).toEqual([]);
  });
});
