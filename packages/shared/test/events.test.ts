import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GAME_EVENT_TYPES, parseGameEvent } from '../src/index.js';

/**
 * Тестовый стаб T-011: схема `GameEvent` (TECH-SPEC 10.2) и её граница
 * `unknown → событие`. Запись в БД проверяется на стороне `server-api`.
 */

const killEvent = {
  type: 'mob.killed',
  actorId: 'char-1',
  payload: { mobId: 'rust-scout' },
  instanceId: 'inst-1',
  timestamp: '2026-09-23T10:00:00.000Z',
};

test('событие проходит и нормализуется в типизированную запись', () => {
  const parsed = parseGameEvent(killEvent);
  assert.ok(parsed);
  assert.equal(parsed.type, 'mob.killed');
  assert.equal(parsed.actorId, 'char-1');
  assert.deepEqual(parsed.payload, { mobId: 'rust-scout' });
  assert.equal(parsed.timestamp.toISOString(), '2026-09-23T10:00:00.000Z');
});

test('событие вне инстанса допустимо (instanceId = null)', () => {
  const parsed = parseGameEvent({ ...killEvent, instanceId: null });
  assert.equal(parsed?.instanceId, null);
});

test('неизвестный тип, пустой actorId и не-объект payload отклоняются', () => {
  assert.equal(parseGameEvent({ ...killEvent, type: 'guild.raid' }), undefined);
  assert.equal(parseGameEvent({ ...killEvent, actorId: '' }), undefined);
  assert.equal(parseGameEvent({ ...killEvent, payload: 'mobId=rust-scout' }), undefined);
  assert.equal(parseGameEvent({ ...killEvent, timestamp: 'не дата' }), undefined);
  assert.equal(parseGameEvent(killEvent.type), undefined);
});

test('типы событий на старте зафиксированы', () => {
  assert.deepEqual(GAME_EVENT_TYPES, ['mob.killed', 'item.looted']);
});
