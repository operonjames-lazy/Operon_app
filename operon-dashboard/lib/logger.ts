/**
 * Structured JSON logger for API routes and backend services.
 * Outputs to console in a format that Vercel Logs can parse and filter.
 *
 * Request ID propagation: middleware sets x-request-id on responses.
 * Use logger.withRequestId(id) to bind it for the duration of a request.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Purchase processed', { route: 'webhook/alchemy', txHash: '0x...' });
 *   logger.error('Commission failed', { txHash: '0x...', error: err.message });
 */

import { AsyncLocalStorage } from 'async_hooks';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

const requestContext = new AsyncLocalStorage<string>();

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const requestId = requestContext.getStore();
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
    context,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
  /** Run a callback with a request ID bound to all log entries within it. */
  withRequestId: <T>(requestId: string, fn: () => T): T => requestContext.run(requestId, fn),
};
