import pino from 'pino';

const level = process.env.COMPANYBRAIN_LOG_LEVEL ?? 'info';

/**
 * Paths pino must never write out. The error path serializes the whole request, so without
 * this a single 4xx puts the caller's session cookie and API key into the log file — and
 * logs get shipped, tailed, and pasted into issues. Redacting at the logger is the only
 * place that covers every call site.
 */
export const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'req.headers["x-api-key"]',
  'req.headers["x-hub-signature"]',
  'req.headers["x-hub-signature-256"]',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  'password',
  'appPassword',
  'apiKey',
  'accessToken',
  'key',
  '*.password',
  '*.appPassword',
  '*.apiKey',
  '*.accessToken',
  'credentials',
  '*.credentials',
];

export const logger = pino({
  level,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
