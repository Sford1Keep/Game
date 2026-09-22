import { randomBytes } from 'node:crypto';

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: Uint8Array;
  port: number;
}

const DEFAULT_DATABASE_URL = 'postgres://game_dev@127.0.0.1:5433/game_dev';

export const loadConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const databaseUrl = env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  let jwtSecret: Uint8Array;
  if (env.JWT_SECRET !== undefined && env.JWT_SECRET.length > 0) {
    jwtSecret = new Uint8Array(Buffer.from(env.JWT_SECRET, 'utf8'));
  } else {
    jwtSecret = randomBytes(32);
    console.warn(
      'JWT_SECRET не задан — использован временный секрет; выданные токены не переживут перезапуск',
    );
  }

  const port = env.PORT !== undefined ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT: некорректное значение ${JSON.stringify(env.PORT)}`);
  }

  return { databaseUrl, jwtSecret, port };
};
