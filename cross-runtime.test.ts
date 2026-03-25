import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecOp } from './ExecOp.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function trimTrailingWhitespace(text: string): string
{
  return text.split('\n').map(line => line.trimEnd()).join('\n');
}

type Runtime = 'deno' | 'bun' | 'node';

function buildCommand(runtime: Runtime, scriptPath: string): string[]
{
  switch (runtime)
  {
    case 'deno':
      return ['deno', 'run', '--allow-read', '--allow-write', '--allow-env', scriptPath];
    case 'bun':
      return ['bun', scriptPath];
    case 'node':
      return ['node', scriptPath];
  }
}

async function runScript(
  runtime: Runtime,
  scriptFile: string,
  stdinInput?: string,
): Promise<string>
{
  const scriptPath = join(scriptDir, scriptFile);
  const command = buildCommand(runtime, scriptPath);
  const op = new ExecOp(command, { stdinInput, cwd: scriptDir });
  const outcome = await op.run();

  if (!outcome.ok)
  {
    throw new Error(`ExecOp failed: ${outcome.failure} — ${outcome.debugData}`);
  }

  if (outcome.value.exitCode !== 0 || outcome.value.signal !== null)
  {
    throw new Error(
      `${runtime} ${scriptFile} exited with code ${outcome.value.exitCode} and signal ${outcome.value.signal}\nstderr: ${outcome.value.stderr}`,
    );
  }

  return trimTrailingWhitespace(outcome.value.stdout).trimEnd();
}

// ─────────────────────────────────────────────────────
// PrintOp
// ─────────────────────────────────────────────────────

const EXPECTED_PRINT = trimTrailingWhitespace(`🎬 PrintOp Demo

Test 1: Simple print
PrintOp can print to stdout! This is the proof! 💪

Test 2: Prohibited words validation

Test 3: Max length validation

Test 4: Long text with no limit
This is a really long help text that would have failed before, but now PrintOp has no default length limit! This is a really long help text that would have failed before, but now PrintOp has no default length limit! This is a really long help text that would have failed before, but now PrintOp has no default length limit!

✅ All tests passed! PrintOp now has no default length limit.`).trimEnd();

describe('PrintOp cross-runtime', () =>
{
  const runtimes: Runtime[] = ['deno', 'bun', 'node'];

  for (const runtime of runtimes)
  {
    test(runtime, async () =>
    {
      const actual = await runScript(runtime, 'PrintOp.ts');
      expect(actual).toBe(EXPECTED_PRINT);
    });
  }
});

// ─────────────────────────────────────────────────────
// PromptForValueOp
// ─────────────────────────────────────────────────────

const EXPECTED_PROMPT = 'Enter something: You entered: hello world';

describe('PromptForValueOp cross-runtime', () =>
{
  const runtimes: Runtime[] = ['deno', 'bun', 'node'];

  for (const runtime of runtimes)
  {
    test(runtime, async () =>
    {
      const actual = await runScript(runtime, 'PromptForValueOp.ts', 'hello world\n');
      expect(actual).toBe(EXPECTED_PROMPT);
    });
  }
});

// ─────────────────────────────────────────────────────
// PromptForPasswordOp
// ─────────────────────────────────────────────────────

const EXPECTED_PASSWORD = 'Enter secret:\nSecret length: 15 characters';

describe('PromptForPasswordOp cross-runtime', () =>
{
  const runtimes: Runtime[] = ['deno', 'bun', 'node'];

  for (const runtime of runtimes)
  {
    test(runtime, async () =>
    {
      const actual = await runScript(runtime, 'PromptForPasswordOp.ts', '  hunter2hunt  \n');
      expect(actual).toBe(EXPECTED_PASSWORD);
    });
  }
});
