import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';

import { loadAbilityCatalog } from '../src/abilityCatalog.js';
import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { DODGE_COOLDOWN_KEY, DODGE_DISTANCE } from '../src/rooms/baseInstanceRoom.js';
import { InstanceState } from '../src/state.js';
import { waitFor } from './helpers.js';

let running: RunningInstanceServer;
let url: string;

const abilities = loadAbilityCatalog();
const RUST_JAB_COOLDOWN_MS = abilities.get('rust-jab')?.cooldownMs;

before(async () => {
  assert.ok(RUST_JAB_COOLDOWN_MS, 'rust-jab не в каталоге /content/abilities');
  running = await startServer(loadConfig({ INSTANCE_PORT: '0', LOG_LEVEL: 'silent' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
});

const join = async () => new Client(url).joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);

type Room = Awaited<ReturnType<typeof join>>;

const cooldownReadyAt = (room: Room, sessionId: string, key: string): number | undefined =>
  room.state.players.get(sessionId)?.cooldowns.get(key)?.readyAtMs;

/** Кулдаун игрока с серверным readyAtMs уже виден клиенту (state sync). */
const waitForCooldown = (room: Room, key: string, readyAtMs: number) =>
  waitFor(
    () => (cooldownReadyAt(room, room.sessionId, key) ?? 0) >= readyAtMs,
    `кулдаун ${key} с readyAtMs >= ${readyAtMs} не попал в state клиента`,
  );

/** Серверное время >= client-часы только приблизительно; даём запас на передачу. */
const settleMs = 50;

test('intent.ability: активация запускает кулдаун, повтор до истечения отклоняется без побочных эффектов', async () => {
  const room = await join();
  await waitFor(
    () => room.state.players.has(room.sessionId),
    'клиент не появился в state после join',
  );
  const cooldownMs = RUST_JAB_COOLDOWN_MS as number;

  room.send('intent.ability', { abilityId: 'rust-jab' });
  const firstReady = Date.now() + cooldownMs; // серверный readyAtMs ~= now + cooldown
  await waitForCooldown(room, 'rust-jab', firstReady - settleMs);
  const readyAt = cooldownReadyAt(room, room.sessionId, 'rust-jab');
  assert.ok(readyAt !== undefined);

  // Повтор в кулдауне: готовность не сдвигается — отклонён без перезапуска.
  room.send('intent.ability', { abilityId: 'rust-jab' });
  await new Promise((resolve) => setTimeout(resolve, 2 * settleMs));
  assert.equal(cooldownReadyAt(room, room.sessionId, 'rust-jab'), readyAt);

  // После истечения: проходит и перезапускает кулдаун.
  await new Promise((resolve) => setTimeout(resolve, readyAt - Date.now() + settleMs));
  room.send('intent.ability', { abilityId: 'rust-jab' });
  await waitForCooldown(room, 'rust-jab', readyAt + cooldownMs - 2 * settleMs);

  await room.leave(true);
});

test('неизвестный abilityId и мусор отклоняются, комната остаётся рабочей', async () => {
  const room = await join();
  await waitFor(
    () => room.state.players.has(room.sessionId),
    'клиент не появился в state после join',
  );

  room.send('intent.ability', { abilityId: 'no-such-ability' });
  room.send('intent.ability', { abilityId: '' });
  room.send('intent.ability', 'мусор');
  room.send('intent.ability', { abilityId: 42 });

  await new Promise((resolve) => setTimeout(resolve, 2 * settleMs));
  assert.equal(cooldownReadyAt(room, room.sessionId, 'no-such-ability'), undefined);
  assert.equal(cooldownReadyAt(room, room.sessionId, ''), undefined);

  // Валидная активация после мусора работает — обработчик не сломан.
  room.send('intent.ability', { abilityId: 'marker-shot' });
  await waitForCooldown(room, 'marker-shot', Date.now() + 1);

  await room.leave(true);
});

test('intent.dodge: рывок смещает авторитетно на фиксированную длину, повтор в кулдауне — без смещения', async () => {
  const room = await join();
  await waitFor(
    () => room.state.players.has(room.sessionId),
    'клиент не появился в state после join',
  );
  const player = () => room.state.players.get(room.sessionId);

  // Направление любое (в т.ч. не нормализованное) — сервер сам ведёт длину.
  room.send('intent.dodge', { dirX: 0, dirY: -7 });
  await waitFor(
    () => Math.abs((player()?.y ?? 0) + DODGE_DISTANCE) < 1e-6,
    'рывок не сдвинул позицию на DODGE_DISTANCE',
  );
  const y = player()?.y;
  assert.ok(y !== undefined);
  assert.ok(Math.abs(player()?.x ?? 0) < 1e-9, 'смещение только по направлению вектора');

  // Повтор в кулдауне уклонения и мусорные payload — без нового смещения.
  room.send('intent.dodge', { dirX: 1, dirY: 0 });
  room.send('intent.dodge', { dirX: 0, dirY: 0 }); // нулевой вектор
  room.send('intent.dodge', 'мусор');
  await new Promise((resolve) => setTimeout(resolve, 2 * settleMs));
  assert.equal(player()?.y, y);

  // После истечения кулдауна рывок снова проходит.
  const readyAt = cooldownReadyAt(room, room.sessionId, DODGE_COOLDOWN_KEY);
  assert.ok(readyAt !== undefined);
  await new Promise((resolve) => setTimeout(resolve, readyAt - Date.now() + settleMs));
  room.send('intent.dodge', { dirX: 1, dirY: 0 });
  await waitFor(
    () => Math.abs((player()?.x ?? 0) - DODGE_DISTANCE) < 1e-6,
    'рывок после истечения кулдауна не применился',
  );

  await room.leave(true);
});
