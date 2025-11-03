import winston from 'winston';

const level = (process.env['LOG_LEVEL'] || 'info').toLowerCase();

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} ${level}: ${message}${rest}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`, { reqId: (req as any).id });
    });
    next();
  };
}
