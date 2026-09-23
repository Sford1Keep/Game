import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Pool } from 'pg';

import {
  createLogger,
  parseGameEvent,
  toCharacterId,
  toInstanceId,
  type GameEvent,
} from '@game/shared';

import { loadConfig } from '../src/config.js';
import { runMigrations } from '../src/db/migrate.js';
import { GameEventStore } from '../src/events/store.js';

/**
 * Стаб приёмки T-011 (TECH-SPEC 10.2): запись события через `GameEventStore`
 * попадает в `game_events` со всеми полями, повторная запись — вторая строка,
 * а не перезапись, и БД отказывает UPDATE/DELETE. PostgreSQL реальный —
 * dev-кластер на 5433, как в тестах аккаунтов.
 */

const config = loadConfig({
  ...(process.env.DATABASE_URL === undefined ? {} : { DATABASE_URL: process.env.DATABASE_URL }),
  JWT_SECRET: 'test-secret-0123456789abcdef-0123456789abcdef',
  LOG_LEVEL: 'silent',
});

let pool: Pool;
let events: GameEventStore;

const killEvent = (overrides: Partial<Omit<GameEvent, 'actorId'>> = {}): GameEvent =>
  parseGameEvent({
    type: 'mob.killed',
    actorId: toCharacterId('hero-one'),
    payload: { mobId: 'rust-scout', damage: 12 },
    instanceId: toInstanceId('inst-1'),
    timestamp: new Date('2026-09-23T10:00:00.000Z'),
    ...overrides,
  }) as GameEvent;

before(async () => {
  pool = new Pool({ connectionString: config.databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    await runMigrations(client, createLogger({ module: 'server-api' }, { level: 'silent' }));
  } finally {
    client.release();
  }
  await pool.query('truncate table game_events');
  events = new GameEventStore(pool, createLogger({ module: 'server-api' }, { level: 'silent' }));
});

after(async () => {
  await pool.end();
});

test('записанное событие читается из таблицы со всеми полями', async () => {
  const recorded = await events.record(killEvent());

  const { rows } = await pool.query<{
    id: string;
    type: string;
    actor_id: string;
    instance_id: string | null;
    payload: { mobId: string; damage: number };
    occurred_at: Date;
  }>('select * from game_events where id = $1', [recorded.id]);

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row?.type, 'mob.killed');
  assert.equal(row?.actor_id, 'hero-one');
  assert.equal(row?.instance_id, 'inst-1');
  assert.deepEqual(row?.payload, { mobId: 'rust-scout', damage: 12 });
  assert.equal(row?.occurred_at.toISOString(), '2026-09-23T10:00:00.000Z');
});

test('событие вне инстанса записывается с null в instance_id', async () => {
  const recorded = await events.record(killEvent({ instanceId: null }));
  const { rows } = await pool.query<{ instance_id: string | null }>(
    'select instance_id from game_events where id = $1',
    [recorded.id],
  );
  assert.equal(rows[0]?.instance_id, null);
});

test('повторная запись того же события не перезаписывает предыдущую', async () => {
  const before = await pool.query<{ count: string }>(
    'select count(*)::text as count from game_events',
  );
  const startCount = Number(before.rows[0]?.count);

  const first = await events.record(killEvent());
  const second = await events.record(killEvent());
  assert.notEqual(first.id, second.id);

  const { rows } = await pool.query<{ count: string }>(
    'select count(*)::text as count from game_events where type = $1 and actor_id = $2',
    ['mob.killed', 'hero-one'],
  );
  assert.equal(Number(rows[0]?.count), startCount + 2);
});

test('обновление и удаление строк game_events запрещены на уровне БД', async () => {
  const recorded = await events.record(killEvent());

  await assert.rejects(
    () =>
      pool.query('update game_events set type = $1 where id = $2', ['item.looted', recorded.id]),
    /append-only/,
  );
  await assert.rejects(
    () => pool.query('delete from game_events where id = $1', [recorded.id]),
    /append-only/,
  );
});

test('неизвестный тип события не доходит до записи', async () => {
  assert.equal(parseGameEvent({ ...killEvent(), type: 'guild.raid' }), undefined);
  await assert.rejects(
    () =>
      pool.query('insert into game_events (type, actor_id, occurred_at) values ($1, $2, now())', [
        'guild.raid',
        'hero-one',
      ]),
    /game_events_type_check/,
  );
});
