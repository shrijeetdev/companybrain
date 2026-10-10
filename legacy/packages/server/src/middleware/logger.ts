import pino from 'pino';

const level = process.env.COMPANYBRAIN_LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
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
