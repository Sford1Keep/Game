import type { Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

import { AccountService } from './accounts/service.js';
import { TokenService } from './accounts/token.js';
import { type AppConfig, loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './http/app.js';

export interface RunningServer {
  server: Server;
  pool: Pool;
  port: number;
}

export const startServer = async (config: AppConfig): Promise<RunningServer> => {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

  const client = await pool.connect();
  try {
    const applied = await runMigrations(client);
    if (applied.length > 0) {
      console.warn(`server-api: применены миграции: ${applied.join(', ')}`);
    }
  } finally {
    client.release();
  }

  const accounts = new AccountService(pool, new TokenService(config.jwtSecret));
  const app = createApp(accounts);

  const server = app.listen(config.port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('ожидался TCP-порт после listen');
  }
  return { server, pool, port: address.port };
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const config = loadConfig(process.env);
  const { server, pool, port } = await startServer(config);
  console.warn(`server-api: слушает http://127.0.0.1:${port}`);

  const shutdown = (): void => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
