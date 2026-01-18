export type LogLevel = 'log' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string, meta?: unknown) => void;

export function logMessage(
  logger: Logger | undefined,
  level: LogLevel,
  message: string,
  meta?: unknown
): void {
  if (logger) {
    logger(level, message, meta);
    return;
  }

  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) {
    consoleFn(message, meta);
  } else {
    consoleFn(message);
  }
}
