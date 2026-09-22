import { WorldStore } from './game-core/world.js';
import { connectInstance } from './net/instanceSession.js';
import { createGame } from './render/instanceScene.js';

/**
 * Бутстрап клиента: собирает game-core, сетевой адаптер и рендер. URL сервера
 * можно перебить строкой запроса `?server=ws://host:port` (dev-сценарии).
 */

const DEFAULT_SERVER_URL = 'ws://127.0.0.1:2600';
const ROOM_NAME = 'instance';

const search = new URLSearchParams(typeof document === 'undefined' ? '' : document.location.search);
const serverUrl = search.get('server') ?? DEFAULT_SERVER_URL;

const world = new WorldStore();

// Dev-хук: инспектирование roster из консоли/автотестов (только для Фазы 0).
declare global {
  interface Window {
    __gameWorld?: WorldStore;
    __gameSync?: () => void;
  }
}
window.__gameWorld = world;

const mount = document.getElementById('game');
if (mount === null) {
  throw new Error('нет контейнера #game');
}
createGame(world, 'game');

try {
  const session = await connectInstance(serverUrl, ROOM_NAME, world);
  world.localId = session.sessionId;
  window.__gameSync = () => session.sync();

  // Опрос state из цикла рендера — deltas приходят state sync'ом Colyseus.
  const loop = (): void => {
    session.sync();
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
