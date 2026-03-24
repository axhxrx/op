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

export interface LoggerOptions
{
  namespace?: string;
  logWriter?: LoggerWriter;
  warnWriter?: LoggerWriter;
  errorWriter?: LoggerWriter;
}

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
    if (this.warnWriter)
    {
      this.warnWriter(text);
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
    if (this.errorWriter)
    {
      this.errorWriter(text);
      return;
    }
    console.error(text);
  }

  /**
   Create a child logger with a sub-namespace

   @example
   ```typescript
   const parent = new Logger('App');
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
