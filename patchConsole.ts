import { format } from 'node:util';
import { SharedContext } from './SharedContext.ts';

/**
 Stores the original console methods so they can be restored by `unpatchConsole()`.
 */
const originals = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

let patched = false;

/**
 Monkey-patches `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug` so that their output flows through the effective IOContext's stdout/stderr streams.

 This makes all console output compatible with TeeStream (logging to file) and any other IOContext-based output capture.

 Before `OpRunner.create()` is called, `SharedContext.effectiveIOContext` falls back to `process.stdout`/`process.stderr`, so the patch is effectively a no-op until the framework is initialized.

 This function is idempotent — calling it multiple times is safe.

 // TODO: In a future PR, console.debug could be routed to file-only logging
 // TODO: Consider patching console.table, console.group, console.time, etc.
 */
export function patchConsole(): void
{
  if (patched) return;
  patched = true;

  console.log = (...args: unknown[]): void =>
  {
    SharedContext.effectiveIOContext.stdout.write(format(...args) + '\n');
  };

  console.info = console.log;

  console.warn = (...args: unknown[]): void =>
  {
    SharedContext.effectiveIOContext.stderr.write(format(...args) + '\n');
  };

  console.error = console.warn;

  // TODO: console.debug could route to file-only logging in a future PR.
  // For now, it behaves the same as console.log.
  console.debug = console.log;
}

/**
 Restores the original console methods, undoing the monkey-patch.

 Mainly useful in tests to ensure a clean environment.
 */
export function unpatchConsole(): void
{
  if (!patched) return;
  Object.assign(console, originals);
  patched = false;
}

/**
 Returns whether the console is currently patched.
 */
export function isConsolePatched(): boolean
{
  return patched;
}
