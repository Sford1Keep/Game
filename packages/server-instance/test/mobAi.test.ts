import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toMobId, type MobConfig } from '@game/shared';

import { MOB_ATTACK_INTERVAL_MS, MOB_ATTACK_RANGE, stepMob } from '../src/mobAi.js';
import { MobState, PlayerState } from '../src/state.js';

/**
 * Юнит AI моба (T-015): `stepMob` вызывается напрямую с фиктивными
 * `nowMs`/`dtMs` — без комнаты, clock и реальных таймеров.
 */

const CONFIG: MobConfig = {
  id: toMobId('test-mob'),
  name: 'Тестовый моб',
  faction: 'techno',
  hp: 40,
  damage: 5,
  moveSpeed: 3,
  aggroRadius: 6,
  gold: 0,
  xp: 0,
};

const makeMob = (x: number, y: number): InstanceType<typeof MobState> => {
  const mob = new MobState();
  mob.entityId = 'test-mob#1';
  mob.mobId = CONFIG.id;
  mob.x = x;
  mob.y = y;
  mob.hp = CONFIG.hp;
  return mob;
};

const makePlayer = (x: number, y: number): InstanceType<typeof PlayerState> => {
  const player = new PlayerState();
  player.x = x;
  player.y = y;
  player.hp = 50;
  return player;
};

const TICK_MS = 100;

test('игрок вне радиуса агро: цели нет, стоит на месте, hp не тронут', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(10, 0);
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, TICK_MS);

  assert.equal(mob.targetId, '');
  assert.equal(mob.x, 0);
  assert.equal(player.hp, 50);
});

test('вход в радиус: цель выбрана, моб сближается по moveSpeed за dt', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(5, 0);
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, TICK_MS);

  assert.equal(mob.targetId, 's1');
  // moveSpeed 3 ед/с * 0.1 с = 0.3 к цели; урон ещё не время — дистанция > MOB_ATTACK_RANGE
  assert.ok(Math.abs(mob.x - 0.3) < 1e-9);
  assert.equal(player.hp, 50);
});

test('вплотную: удар раз в интервал, между ударами hp не меняется', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(MOB_ATTACK_RANGE - 0.5, 0);
  const runtime = { readyToAttackAtMs: 0 };
  const players = new Map([['s1', player]]);

  stepMob(mob, CONFIG, players, runtime, 1_000, TICK_MS);
  assert.equal(player.hp, 45);
  assert.equal(runtime.readyToAttackAtMs, 1_000 + MOB_ATTACK_INTERVAL_MS);

  stepMob(mob, CONFIG, players, runtime, 1_500, TICK_MS);
  assert.equal(player.hp, 45); // кулдаун удара ещё не истёк

  stepMob(mob, CONFIG, players, runtime, 2_100, TICK_MS);
  assert.equal(player.hp, 40);
});

test('сближение не перелетает цель: шаг ограничен оставшейся дистанцией', () => {
  const mob = makeMob(0, 0);
  // чуть дальше MOB_ATTACK_RANGE, но ближе, чем moveSpeed*dt (3 за 1000 мс)
  const player = makePlayer(1.6, 0);
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, 1_000);

  assert.equal(mob.x, 1.6);
  assert.equal(mob.y, 0);
});

test('цель теряет агро на кайте и при выходе игрока из комнаты', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(5, 0);
  const runtime = { readyToAttackAtMs: 0 };
  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, TICK_MS);
  assert.equal(mob.targetId, 's1');

  player.x = 20; // игрок отбежал за aggroRadius
  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 2_000, TICK_MS);
  assert.equal(mob.targetId, '');
  assert.equal(player.hp, 50);

  mob.targetId = 's1'; // цель цела, но игрока в комнате больше нет
  stepMob(mob, CONFIG, new Map(), runtime, 3_000, TICK_MS);
  assert.equal(mob.targetId, '');
});

test('выбирается ближайший игрок, а не первый попавшийся', () => {
  const mob = makeMob(0, 0);
  const far = makePlayer(5, 0);
  const near = makePlayer(0, 3);

  stepMob(
    mob,
    CONFIG,
    new Map([
      ['far', far],
      ['near', near],
    ]),
    { readyToAttackAtMs: 0 },
    1_000,
    TICK_MS,
  );

  assert.equal(mob.targetId, 'near');
});
