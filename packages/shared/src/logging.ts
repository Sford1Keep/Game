import { pino, type Logger } from 'pino';

/**
 * Диагностическое логирование (TECH-SPEC 10.1): общий фасад над `pino`, чтобы
 * формат и уровни не расходились пакет от пакета. Игровые события (`GameEvent`)
 * к этому отношению не имеют — это данные, а не отладочный вывод.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export const LOG_LEVELS: readonly LogLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
];

/** Поля контекста, которые несёт каждая запись логгера (requestId, instanceId, ...). */
export type LoggerContext = Record<string, unknown>;

export interface LoggerOptions {
  level?: LogLevel;
  /** Человекочитаемый вывод через `pino-pretty`; по умолчанию выключен — его включает только процесс-владелец. */
  pretty?: boolean;
  /** Куда писать записи; нужен тестам, чтобы читать structured-вывод не перехватывая stdout. */
  destination?: NodeJS.WritableStream;
}

export const parseLogLevel = (raw: string): LogLevel => {
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new Error(`LOG_LEVEL: неизвестный уровень ${JSON.stringify(raw)}`);
  }
  return raw as LogLevel;
};

/** `LOG_LEVEL` из окружения; по умолчанию `info` в проде и `debug` в dev. */
export const resolveLogLevel = (env: NodeJS.ProcessEnv): LogLevel => {
  if (env.LOG_LEVEL !== undefined) {
    return parseLogLevel(env.LOG_LEVEL);
  }
  return env.NODE_ENV === 'production' ? 'info' : 'debug';
};

export const createLogger = (context: LoggerContext = {}, options: LoggerOptions = {}): Logger =>
  pino(
    {
      level: options.level ?? resolveLogLevel(process.env),
      base: { ...context },
      ...(options.pretty ? { transport: { target: 'pino-pretty' } } : {}),
    },
    options.destination,
  );
