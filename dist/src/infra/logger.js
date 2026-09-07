import { pino } from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: { paths: ['*.privateKey', '*.seedPhrase', '*.secret', '*.apiKey', '*.authorization'], censor: '[REDACTED]' } });
