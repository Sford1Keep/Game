import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LOCAL_SPEED,
  MovementController,
  SEND_INTERVAL_MS,
  SNAP_TOLERANCE,
} from '../src/game-core/movement.js';
import type { MovementDeps } from '../src/game-core/movement.js';

/**
 * Юнит-тесты предсказания (чистый game-core, без браузера и сети):
 * часы и отправка инжектируются, «сервер» эмулируется суммой принятых дельт.
 */

interface FakeServer {
  position: { x: number; y: number };
  sent: Array<{ dx: number; dy: number }>;
  deps: MovementDeps;
  /** Доставка state-обновления обратно контроллеру (авторитет = сумма принятых). */
  deliverState(controller: MovementController): void;
  tick(ms: number): void;
}

const makeFake = (spawn = { x: 0, y: 0 }): FakeServer => {
  let nowMs = 1_000;
  const sent: Array<{ dx: number; dy: number }> = [];
  const position = { ...spawn };
  return {
    position,
    sent,
    deps: {
      sendMove: (dx, dy) => {
        sent.push({ dx, dy });
        position.x += dx;
        position.y += dy;
      },
      now: () => nowMs,
    },
    deliverState: (controller) => controller.onAuthoritative({ ...position }),
    tick: (ms) => {
      nowMs += ms;
    },
  };
};

test('предсказание двигается немедленно, до получения state', () => {
  const fake = makeFake();
  const c = new MovementController({ x: 0, y: 0 }, fake.deps);

  c.setDirection({ x: 1, y: 0 });
  c.update(16); // один кадр

  assert.ok(c.position.x > 0, 'локальная позиция должна сдвинуться в том же кадре');
});

test('нет расхождения с сервером после нескольких секунд движения', () => {
  const fake = makeFake();
  const c = new MovementController({ x: 0, y: 0 }, fake.deps);
  c.setDirection({ x: 1, y: 0 });

  const dt = 16;
  const totalMs = 5_000;
  for (let elapsed = 0; elapsed < totalMs; elapsed += dt) {
    c.update(dt);
    fake.tick(dt);
    // доставка state с задержкой в один интервал отправки
    if (elapsed % (SEND_INTERVAL_MS * 2) === 0) {
      fake.deliverState(c);
    }
  }
  fake.deliverState(c);
  c.flush();
  fake.deliverState(c);

  const expected = (totalMs / 1000) * LOCAL_SPEED;
  assert.ok(Math.abs(c.position.x - expected) < 0.6, `предсказание уехало: ${c.position.x}`);
  assert.ok(Math.abs(fake.position.x - expected) < 0.6, `сервер уехал: ${fake.position.x}`);
  assert.ok(
    Math.abs(c.position.x - fake.position.x) < SNAP_TOLERANCE,
    'предсказание и сервер разошлись',
  );
});

test('авторитетное перемещение игрока сервером перебивает предсказание', () => {
  const fake = makeFake();
  const c = new MovementController({ x: 0, y: 0 }, fake.deps);
  c.setDirection({ x: 1, y: 0 });
  c.update(1000); // уедем далеко вперёд
  c.flush(); // дельты ушли и применены «сервером»
  fake.deliverState(c); // предсказание и авторитет совпали: x = 4

  // Сервер «телепортирует» игрока (будущие статусы/откаты) — не через наши дельты.
  fake.position.x = 2;
  fake.position.y = 0;
  c.onAuthoritative({ ...fake.position });

  assert.ok(
    Math.abs(c.position.x - 2) <= SNAP_TOLERANCE,
    `предсказание не притянуто к авторитету: ${c.position.x}`,
  );
});

test('направление нормализуется: диагональ не быстрее прямой', () => {
  const fake = makeFake();
  const c = new MovementController({ x: 0, y: 0 }, fake.deps);
  c.setDirection({ x: 1, y: 1 });
  c.update(1000 / 60);
  const diag = Math.hypot(c.position.x, c.position.y);

  const c2 = new MovementController({ x: 0, y: 0 }, fake.deps);
  c2.setDirection({ x: 1, y: 0 });
  c2.update(1000 / 60);

  assert.ok(Math.abs(diag - c2.position.x) < 1e-9);
});

test('намерения уходят не чаще интервала отправки', () => {
  const fake = makeFake();
  const c = new MovementController({ x: 0, y: 0 }, fake.deps);
  c.setDirection({ x: 0, y: 1 });

  for (let i = 0; i < 60; i++) {
    c.update(16); // ~1 сек кадров по 16 мс
    fake.tick(16);
  }
  c.flush(); // остаток unsent отправляем, дальше сравниваем сумму дельт с путём
  const sends = fake.sent.length;
  assert.ok(sends >= 15 && sends <= 21, `ожидалось ~20 отправок за секунду, получено ${sends}`);
  const totalY = fake.sent.reduce((acc, s) => acc + s.dy, 0);
  assert.ok(Math.abs(totalY - c.position.y) < 1e-9, 'сумма дельт должна равняться пути');
});
