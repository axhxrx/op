/**
 Namespaced logger with configurable writers.

 By default, Logger calls `console.log`/`console.warn`/`console.error`, which — when the framework is initialized via `main()` or `init()` — are monkey-patched to flow through the IOContext. This means Logger output is automatically compatible with TeeStream logging and other IO capture without any special configuration.

 For cases where output should bypass the screen entirely (e.g., verbose debug logging to a file), provide custom writer functions via `LoggerOptions`.

 // TODO: Add log-level-based routing so that e.g. debug messages can be configured
 // to go to file only, while info/warn/error go to the screen. This would work by
 // having the Logger check a configuration object and route to either console.*
 // (which goes through IOContext via the monkey-patch) or directly to a file writer
 // (which bypasses IOContext and the screen).
 */
type LoggerWriter = (message: string) => void;

/**
 Options for creating a `Logger` instance.
 */
export interface LoggerOptions
{
  /**
  Optional namespace that will be used as a prefix for all log messages with (e.g. "[MyNamespace] message")
   */
  namespace?: string;

  /**
   Allows you to provide custom writer functions for log, warn, and error messages. If not provided, defaults to console.log/warn/error. If you want separate custom writers for warn/error, you can provide `warnWriter` and `errorWriter` as well; otherwise if `logWriter` is provided, it will be used for those levels.
   */
  logWriter?: LoggerWriter;

  /**
    Optional custom writer for warning messages. If not provided, defaults to console.warn.
   */
  warnWriter?: LoggerWriter;
  /**
    Optional custom writer for error messages. If not provided, defaults to console.error.
   */
  errorWriter?: LoggerWriter;
}

/**
 Simple namespaced logger that wraps `console` with optional custom writers. Supports hierarchical namespaces via `child()`.
 */
export class Logger
{
  private namespace?: string;
  private logWriter?: LoggerWriter;
  private warnWriter?: LoggerWriter;
  private errorWriter?: LoggerWriter;

  constructor(options: LoggerOptions = {})
  {
    this.namespace = options.namespace;
    this.logWriter = options.logWriter;
    this.warnWriter = options.warnWriter;
    this.errorWriter = options.errorWriter;
  }

  /**
   Log an informational message
   */
  log(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    const text = prefix + message;
    if (this.logWriter)
    {
      this.logWriter(text);
      return;
    }
    console.log(text);
  }

  /**
   Log a warning message
   */
  warn(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    const text = prefix + message;
    const writer = this.warnWriter || this.logWriter;
    if (writer)
    {
      writer(text);
      return;
    }
    console.warn(text);
  }

  /**
   Log an error message
   */
  error(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    const text = prefix + message;
    const writer = this.errorWriter || this.logWriter;
    if (writer)
    {
      writer(text);
      return;
    }
    console.error(text);
  }

  /**
   Create a child logger with a sub-namespace

   @example
   ```typescript
   const parent = new Logger({ namespace: 'App' });
   const child = parent.child('Database');

   parent.log('Starting'); // [App] Starting
   child.log('Connected');  // [App:Database] Connected
   ```
   */
  child(subNamespace: string): Logger
  {
    const newNamespace = this.namespace
      ? `${this.namespace}:${subNamespace}`
      : subNamespace;
    return new Logger({
      namespace: newNamespace,
      logWriter: this.logWriter,
      warnWriter: this.warnWriter,
      errorWriter: this.errorWriter,
    });
  }

  /**
   Get the current namespace
   */
  getNamespace(): string | undefined
  {
    return this.namespace;
  }
}

/**
 Create a default logger (no namespace)
 */
export function createDefaultLogger(options: LoggerOptions = {}): Logger
{
  return new Logger(options);
}
