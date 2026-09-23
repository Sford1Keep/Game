import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Vector2 } from '@game/shared';

import {
  CombatController,
  DODGE_KEY,
  type CombatAction,
  type CombatDeps,
} from '../src/game-core/combat.js';

/**
 * Юнит-тесты боёвки ввода (чистый game-core, без браузера и сети — тот же
 * порядок, что у `movement.test.ts`): часы и отправка инжектируются.
 */

interface FakeNet {
  abilities: string[];
  dodges: Vector2[];
  deps: CombatDeps;
  tick(ms: number): void;
}

const makeFake = (startMs = 10_000): FakeNet => {
  let nowMs = startMs;
  const abilities: string[] = [];
  const dodges: Vector2[] = [];
  return {
    abilities,
    dodges,
    deps: {
      sendAbility: (id) => {
        abilities.push(id);
      },
      sendDodge: (dir) => {
        dodges.push(dir);
      },
      now: () => nowMs,
    },
    tick: (ms) => {
      nowMs += ms;
    },
  };
};

const ACTIONS: CombatAction[] = [
  { key: 'rust-jab', cooldownMs: 900 },
  { key: 'marker-shot', cooldownMs: 5_000 },
  { key: DODGE_KEY, cooldownMs: 2_000 },
];

test('атака до истечения локального кулдауна блокируется, после — интент уходит', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressAbility('rust-jab'), true);
  assert.deepEqual(fake.abilities, ['rust-jab']);

  // Визуальная блокировка и повторное нажатие до истечения 900 мс.
  assert.equal(c.isReady('rust-jab'), false);
  fake.tick(899);
  assert.equal(c.pressAbility('rust-jab'), false);
  assert.equal(c.isReady('rust-jab'), false);
  assert.deepEqual(fake.abilities, ['rust-jab'], 'отклонённое нажатие не шлёт интент');

  fake.tick(1);
  assert.equal(c.isReady('rust-jab'), true);
  assert.equal(c.pressAbility('rust-jab'), true);
  assert.deepEqual(fake.abilities, ['rust-jab', 'rust-jab']);
});

test('кулдауны способностей независимы', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressAbility('rust-jab'), true);
  assert.equal(c.pressAbility('marker-shot'), true);
  assert.equal(c.pressAbility('rust-jab'), false);
  assert.equal(c.isReady('marker-shot'), false);
  assert.equal(c.isReady('rust-jab'), false);

  fake.tick(900);
  assert.equal(c.pressAbility('rust-jab'), true);
  assert.equal(c.isReady('marker-shot'), false, 'маркер ещё на кулдауне');
});

test('неизвестная способность отклоняется без отправки', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressAbility('fireball'), false);
  assert.equal(c.isReady('fireball'), false);
  assert.deepEqual(fake.abilities, []);
});

test('уклонение отправляет направление ввода и уходит на кулдаун', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressDodge({ x: -1, y: 1 }), true);
  assert.deepEqual(fake.dodges, [{ x: -1, y: 1 }], 'длину нормализует сервер');
  assert.equal(c.isReady(DODGE_KEY), false);
  assert.equal(c.pressDodge({ x: 0, y: 1 }), false);

  fake.tick(2_000);
  assert.equal(c.pressDodge({ x: 0, y: 1 }), true);
  assert.equal(fake.dodges.length, 2);
});

test('нулевое направление: уклонение отклоняется без расхода кулдауна', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressDodge({ x: 0, y: 0 }), false);
  assert.deepEqual(fake.dodges, []);
  assert.equal(c.isReady(DODGE_KEY), true, 'кулдаун не должен стартовать');
  assert.equal(c.pressDodge({ x: 1, y: 0 }), true);
});

test('авторитетный readyAtMs продлевает локальную копию', () => {
  const fake = makeFake();
  const c = new CombatController([{ key: 'rust-jab', cooldownMs: 100 }], fake.deps);

  assert.equal(c.pressAbility('rust-jab'), true);
  // Сервер выставил готовность позже локальной оптимистичной метки.
  c.applyServerCooldowns([{ key: 'rust-jab', readyAtMs: fake.deps.now() + 5_000 }]);

  fake.tick(100); // локальный кулдаун уже истёк бы…
  assert.equal(c.isReady('rust-jab'), false, 'но авторитет длиннее');
  assert.equal(c.pressAbility('rust-jab'), false);
});

test('авторитетный readyAtMs раньше локального — локальный не разгоняется', () => {
  const fake = makeFake();
  const c = new CombatController(ACTIONS, fake.deps);

  assert.equal(c.pressAbility('marker-shot'), true);
  // Например, state пришёл из до-нажатного состояния или гонки снапшотов.
  c.applyServerCooldowns([{ key: 'marker-shot', readyAtMs: fake.deps.now() - 1 }]);

  assert.equal(c.isReady('marker-shot'), false);
  fake.tick(4_999);
  assert.equal(c.pressAbility('marker-shot'), false);
  fake.tick(1);
  assert.equal(c.pressAbility('marker-shot'), true);
});
