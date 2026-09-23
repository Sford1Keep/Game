import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PoolClient } from 'pg';

import type { GameLogger } from '@game/shared';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Применяет ещё не применённые .sql-файлы из src/migrations по порядку имён.
 * Каждый файл — отдельная транзакция; факт применения фиксируется в schema_migrations.
 */
export const runMigrations = async (client: PoolClient, log: GameLogger): Promise<string[]> => {
  // Параллельный старт двух процессов (dev-запуск и тесты) не должен применять один
  // и тот же файл дважды, поэтому миграции сериализуются advisory-локом.
  await client.query(`select pg_advisory_lock(hashtext('game_schema_migrations'))`);
  try {
    return await applyPendingMigrations(client, log);
  } catch (err) {
    log.error({ err, migrationsDir: MIGRATIONS_DIR }, 'миграции не применились');
    throw err;
  } finally {
    // Клиент возвращается в пул с жив сессией — без явного unlock лок держался бы
    // до конца жизни процесса и блокировал бы другие соединения.
    await client.query(`select pg_advisory_unlock(hashtext('game_schema_migrations'))`);
  }
};

const applyPendingMigrations = async (client: PoolClient, log: GameLogger): Promise<string[]> => {
  await client.query(
    `create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`,
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await client.query<{ filename: string }>(
    'select filename from schema_migrations',
  );
  const appliedBefore = new Set(rows.map((r) => r.filename));

  const applied: string[] = [];
  for (const file of files) {
    if (appliedBefore.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      log.info({ migration: file }, 'миграция применена');
    } catch (err) {
      await client.query('rollback');
      log.error({ err, migration: file }, 'миграция отклонена, транзакция откачена');
      throw err;
    }
  }
  return applied;
};
