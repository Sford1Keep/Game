import type { Vector2 } from '@game/shared';

import { MovementController } from './game-core/movement.js';
import { WorldStore } from './game-core/world.js';
import { connectInstance } from './net/instanceSession.js';
import { createGame } from './render/instanceScene.js';

/**
 * Бутстрап клиента: собирает game-core, сетевой адаптер и рендер. Здесь же
 * клавиатурный ввод (DOM только в этом слое). URL сервера можно перебить
 * строкой запроса `?server=ws://host:port` (dev-сценарии).
 */

const DEFAULT_SERVER_URL = 'ws://127.0.0.1:2600';
const ROOM_NAME = 'instance';

const search = new URLSearchParams(typeof document === 'undefined' ? '' : document.location.search);
const serverUrl = search.get('server') ?? DEFAULT_SERVER_URL;

const world = new WorldStore();

// Dev-хуки: инспектирование и управление из консоли/автотестов (только Фаза 0).
declare global {
  interface Window {
    __gameWorld?: WorldStore;
    __gameSync?: () => void;
    __gameSetDirection?: (dir: Vector2) => void;
  }
}
window.__gameWorld = world;

const mount = document.getElementById('game');
if (mount === null) {
  throw new Error('нет контейнера #game');
}
createGame(world, 'game');

// Ввод: WASD/стрелки → направление; состояние клавиш собирается в вектор.
const keys = new Set<string>();
const directionFromKeys = (): Vector2 => ({
  x:
    (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
    (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
  y:
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
    (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
});

try {
  const session = await connectInstance(serverUrl, ROOM_NAME, world);
  world.localId = session.sessionId;
  window.__gameSync = () => session.sync();

  const spawn = world.get(session.sessionId)?.position ?? { x: 0, y: 0 };
  const movement = new MovementController(spawn, {
    sendMove: (dx, dy) => session.sendMove(dx, dy),
    now: () => performance.now(),
  });
  window.__gameSetDirection = (dir) => {
    movement.setDirection(dir);
    movement.flush();
  };

  window.addEventListener('keydown', (e) => {
    if (KEY_MOVE.has(e.code)) {
      keys.add(e.code);
      movement.setDirection(directionFromKeys());
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEY_MOVE.has(e.code)) {
      keys.delete(e.code);
      movement.setDirection(directionFromKeys());
      movement.flush(); // отпустить клавишу — последний шаг не должен потеряться
    }
  });

  let lastTick = performance.now();
  const loop = (): void => {
    const now = performance.now();
    const dt = Math.min(now - lastTick, 250); // защита от рывка после фоновой паузы
    lastTick = now;

    session.sync();
    const auth = world.get(session.sessionId)?.position;
    if (auth !== undefined) {
      movement.onAuthoritative(auth);
    }
    movement.update(dt);
    // Рендер показывает предсказание, а не снапшот сервера (отзывчивость, TECH-SPEC 4).
    world.setLocalPosition(movement.position);

    if (document.visibilityState === 'visible') {
      requestAnimationFrame(loop);
    } else {
      setTimeout(loop, 250);
    }
  };
  void loop();
} catch (error) {
  console.warn(`client: не удалось подключиться к ${serverUrl}: ${String(error)}`);
}

const KEY_MOVE = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
