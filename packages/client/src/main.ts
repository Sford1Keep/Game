import type { Vector2 } from '@game/shared';
import { parseAbilityConfig, parseDodgeConfig } from '@game/shared';

import { CombatController, DODGE_KEY, type CombatAction } from './game-core/combat.js';
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

/** Конфиги боёвки раздаются из `/content` (vite publicDir). */
const ABILITY_URLS = ['/abilities/rust-jab.json', '/abilities/marker-shot.json'];
const DODGE_URL = '/mechanics/dodge.json';

const fetchConfig = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`не удалось прочитать конфиг ${url}: ${response.status}`);
  }
  return await response.json();
};

/** Числа кулдаунов — только из конфигов (TECH-SPEC 6), в коде их не держим. */
const loadCombatActions = async (): Promise<CombatAction[]> => {
  const actions: CombatAction[] = [];
  for (const url of ABILITY_URLS) {
    const ability = parseAbilityConfig(await fetchConfig(url));
    if (ability === undefined) {
      throw new Error(`битый конфиг способности: ${url}`);
    }
    actions.push({ key: ability.id, cooldownMs: ability.cooldownMs });
  }
  const dodge = parseDodgeConfig(await fetchConfig(DODGE_URL));
  if (dodge === undefined) {
    throw new Error(`битый конфиг механики: ${DODGE_URL}`);
  }
  actions.push({ key: DODGE_KEY, cooldownMs: dodge.cooldownMs });
  return actions;
};

const world = new WorldStore();

// Dev-хуки: инспектирование и управление из консоли/автотестов (только Фаза 0).
declare global {
  interface Window {
    __gameWorld?: WorldStore;
    __gameSync?: () => void;
    __gameSetDirection?: (dir: Vector2) => void;
    __gameCombat?: CombatController;
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
// Направление рывка — последний ненулевой вектор ввода (стоя на месте,
// уклоняемся туда, куда смотрели; сервер нормализует длину).
let lastDirection: Vector2 = { x: 1, y: 0 };

// Боёвка: клавиша → действие. Раскладка — клиентский ввод, id способностей — из /content.
const KEY_ABILITY = new Map<string, string>([
  ['KeyJ', 'rust-jab'],
  ['KeyK', 'marker-shot'],
]);
const KEY_DODGE = 'Space';

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

  const combat = new CombatController(await loadCombatActions(), {
    sendAbility: (abilityId) => session.sendAbility(abilityId),
    sendDodge: (dir) => session.sendDodge(dir),
    now: () => Date.now(), // та же шкала, что у авторитетных readyAtMs (T-014)
  });
  window.__gameCombat = combat;

  window.addEventListener('keydown', (e) => {
    if (KEY_MOVE.has(e.code)) {
      keys.add(e.code);
      const dir = directionFromKeys();
      movement.setDirection(dir);
      if (dir.x !== 0 || dir.y !== 0) {
        lastDirection = dir;
      }
      return;
    }
    // Боёвка — по факту нажатия: autorepeat зажатой клавиши не должен
    // «выстреливать» сам, как только кулдаун истёк (нужен новый press).
    if (e.repeat) {
      return;
    }
    const abilityId = KEY_ABILITY.get(e.code);
    if (abilityId !== undefined) {
      combat.pressAbility(abilityId); // локальный кулдаун решают за нас (T-017)
    } else if (e.code === KEY_DODGE) {
      e.preventDefault(); // Space не должен скроллить страницу
      combat.pressDodge(lastDirection);
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
    // Авторитетные кулдауны из state — продление локальной копии (T-017).
    combat.applyServerCooldowns(session.localCooldowns());

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
