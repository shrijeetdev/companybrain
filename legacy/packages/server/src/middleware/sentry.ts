// Sentry error tracking integration.
// Captures errors and performance data for monitoring.

import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Initialize Sentry error tracking.
 * Call this once at application startup.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] SENTRY_DSN not set, error tracking disabled');
    return;
  }

  if (initialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version ?? '0.1.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      // Don't send events in development
      if (process.env.NODE_ENV !== 'production') {
        return null;
      }
      // Filter out common non-errors
      if (event.exception?.values?.[0]?.type === 'ResizeObserver loop') {
        return null;
      }
      return event;
    },
  });

  initialized = true;
  console.log('[sentry] Error tracking initialized');
}

/**
 * Capture an exception to Sentry.
 */
export function captureException(error: Error, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Capture a message to Sentry.
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

/**
 * Flush Sentry events before shutdown.
 */
export async function flushSentry() {
  if (!initialized) return;
  await Sentry.flush(2000);
}
