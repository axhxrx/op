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
export class Logger
{
  constructor(private namespace?: string)
  {
  }

  /**
   Log an informational message
   */
  log(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    console.log(prefix + message);
  }

  /**
   Log a warning message
   */
  warn(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    console.warn(prefix + message);
  }

  /**
   Log an error message
   */
  error(message: string): void
  {
    const prefix = this.namespace ? `[${this.namespace}] ` : '';
    console.error(prefix + message);
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
    return new Logger(newNamespace);
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
export function createDefaultLogger(): Logger
{
  return new Logger();
}
