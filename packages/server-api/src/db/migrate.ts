import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PoolClient } from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Применяет ещё не применённые .sql-файлы из src/migrations по порядку имён.
 * Каждый файл — отдельная транзакция; факт применения фиксируется в schema_migrations.
 */
export const runMigrations = async (client: PoolClient): Promise<string[]> => {
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
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
    applied.push(file);
  }
  return applied;
};
