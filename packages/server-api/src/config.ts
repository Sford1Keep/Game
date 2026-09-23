import { randomBytes } from 'node:crypto';

import { resolveLogLevel, type LogLevel } from '@game/shared';

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: Uint8Array;
  port: number;
  logLevel: LogLevel;
  /** Человекочитаемый вывод `pino-pretty` — только для не-прода (TECH-SPEC 10.1). */
  logPretty: boolean;
  /** JWT_SECRET не задан: секрет сгенерирован на запуск, токены не переживут перезапуск. */
  ephemeralJwtSecret: boolean;
}

const DEFAULT_DATABASE_URL = 'postgres://game_dev@127.0.0.1:5433/game_dev';

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const databaseUrl = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  let jwtSecret: Uint8Array;
  let ephemeralJwtSecret = false;
  if (env.JWT_SECRET !== undefined && env.JWT_SECRET.length > 0) {
    jwtSecret = new Uint8Array(Buffer.from(env.JWT_SECRET, 'utf8'));
  } else {
    jwtSecret = randomBytes(32);
    ephemeralJwtSecret = true;
  }

  // 18080, а не 8080: на dev-машинах 8080 может занят локальным сервисом.
  const port = env.PORT !== undefined ? Number(env.PORT) : 18080;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT: некорректное значение ${JSON.stringify(env.PORT)}`);
  }

  return {
    databaseUrl,
    jwtSecret,
    port,
    logLevel: resolveLogLevel(env),
    logPretty: env.NODE_ENV !== 'production',
    ephemeralJwtSecret,
  };
};
