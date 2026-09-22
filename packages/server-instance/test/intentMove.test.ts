import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { Client } from '@colyseus/sdk';

import { loadConfig } from '../src/config.js';
import { INSTANCE_ROOM_NAME, startServer, type RunningInstanceServer } from '../src/index.js';
import { InstanceState } from '../src/state.js';
import { waitFor } from './helpers.js';

let running: RunningInstanceServer;
let url: string;

before(async () => {
  running = await startServer(loadConfig({ INSTANCE_PORT: '0' }));
  url = `ws://127.0.0.1:${running.port}`;
});

after(async () => {
  await running.server.gracefullyShutdown(false);
});

const join = async () => new Client(url).joinOrCreate(INSTANCE_ROOM_NAME, undefined, InstanceState);

const positionOf = (
  room: Awaited<ReturnType<typeof join>>,
  sessionId: string,
): { x: number; y: number } | undefined => {
  const player = room.state.players.get(sessionId);
  return player === undefined ? undefined : { x: player.x, y: player.y };
};

test('intent.move авторитетно смещает позицию и доходит до остальных', async () => {
  const roomA = await join();
  const roomB = await join();
  await waitFor(() => roomB.state.players.has(roomA.sessionId), 'второй клиент не увидел первого');

  roomA.send('intent.move', { dx: 5, dy: -3 });

  // Авторитетная позиция одинакова у обоих клиентов (state sync дельтами).
  await waitFor(() => {
    const p = positionOf(roomB, roomA.sessionId);
    return p?.x === 5 && p?.y === -3;
  }, 'смещение не применилось в state второго клиента');
  assert.deepEqual(positionOf(roomA, roomA.sessionId), { x: 5, y: -3 });

  await roomA.leave(true);
  await roomB.leave(true);
});

test('невалидный payload отклоняется, позиция не меняется', async () => {
  const roomA = await join();
  await waitFor(
    () => roomA.state.players.has(roomA.sessionId),
    'клиент не появился в state после join',
  );

  roomA.send('intent.move', { dx: '10', dy: 2 }); // строка вместо числа
  roomA.send('intent.move', { dx: Number.NaN, dy: 0 });
  roomA.send('intent.move', 'мусор');

  // После мусора ход должен применяться нормально — валидация не ломает обработчик.
  roomA.send('intent.move', { dx: 1, dy: 1 });
  await waitFor(() => {
    const p = positionOf(roomA, roomA.sessionId);
    return p?.x === 1 && p?.y === 1;
  }, 'валидный ход после невалидных не применился');

  await roomA.leave(true);
});
