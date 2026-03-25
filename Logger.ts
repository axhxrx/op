/**
 Simple Logger for ops to use instead of console.log

 Future enhancements (not implemented yet):
 - Log levels and filtering
 - File output
 - Hierarchical loggers (parent/child relationships)
 - Structured logging
 - Log rotation

 Current implementation: Simple wrapper around console with namespace
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
