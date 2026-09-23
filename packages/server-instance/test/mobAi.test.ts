import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toMobId, type MobConfig } from '@game/shared';

import { stepMob } from '../src/mobAi.js';
import { MobState, PlayerState } from '../src/state.js';

/**
 * Юнит AI моба (T-015, баланс из конфига — T-020): `stepMob` вызывается напрямую
 * с фиктивными `nowMs`/`dtMs` — без комнаты, clock и реальных таймеров.
 */

const CONFIG: MobConfig = {
  id: toMobId('test-mob'),
  name: 'Тестовый моб',
  faction: 'techno',
  hp: 40,
  damage: 5,
  moveSpeed: 3,
  aggroRadius: 6,
  resetRadius: 10,
  attackRange: 1.5,
  attackIntervalMs: 1_000,
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

const makePlayer = (x: number, y: number, hp = 50): InstanceType<typeof PlayerState> => {
  const player = new PlayerState();
  player.x = x;
  player.y = y;
  player.hp = hp;
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
  // moveSpeed 3 ед/с * 0.1 с = 0.3 к цели; урон ещё не время — дистанция > attackRange
  assert.ok(Math.abs(mob.x - 0.3) < 1e-9);
  assert.equal(player.hp, 50);
});

test('вплотную: удар раз в attackIntervalMs из конфига, между ударами hp не меняется', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(CONFIG.attackRange - 0.5, 0);
  const runtime = { readyToAttackAtMs: 0 };
  const players = new Map([['s1', player]]);

  stepMob(mob, CONFIG, players, runtime, 1_000, TICK_MS);
  assert.equal(player.hp, 45);
  assert.equal(runtime.readyToAttackAtMs, 1_000 + CONFIG.attackIntervalMs);

  stepMob(mob, CONFIG, players, runtime, 1_500, TICK_MS);
  assert.equal(player.hp, 45); // кулдаун удара ещё не истёк

  stepMob(mob, CONFIG, players, runtime, 2_100, TICK_MS);
  assert.equal(player.hp, 40);
});

test('сближение не перелетает цель: шаг ограничен оставшейся дистанцией', () => {
  const mob = makeMob(0, 0);
  // чуть дальше attackRange, но ближе, чем moveSpeed*dt (3 за 1000 мс)
  const player = makePlayer(CONFIG.attackRange + 0.1, 0);
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, 1_000);

  assert.equal(mob.x, CONFIG.attackRange + 0.1);
  assert.equal(mob.y, 0);
});

test('гистерезис агро (T-020): между aggroRadius и resetRadius цель удерживается, за resetRadius — теряется', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(5, 0);
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, TICK_MS);
  assert.equal(mob.targetId, 's1');

  // игрок за aggroRadius (6), но внутри resetRadius (10) — цель сохранена, моб сближается
  player.x = 8.5;
  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 2_000, TICK_MS);
  assert.equal(mob.targetId, 's1');
  assert.ok(mob.x > 0, 'моб продолжает преследование удержанной цели');

  // выход за resetRadius — сброс
  player.x = 11;
  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 3_000, TICK_MS);
  assert.equal(mob.targetId, '');

  mob.targetId = 's1'; // цель цела, но игрока в комнате больше нет
  stepMob(mob, CONFIG, new Map(), runtime, 4_000, TICK_MS);
  assert.equal(mob.targetId, '');
});

test('захват цели только в aggroRadius: игрок в коридоре между радиусами новым целей не становится', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(8.5, 0); // > aggroRadius 6, < resetRadius 10, целей до этого не было
  const runtime = { readyToAttackAtMs: 0 };

  stepMob(mob, CONFIG, new Map([['s1', player]]), runtime, 1_000, TICK_MS);

  assert.equal(mob.targetId, '');
});

test('мёртвый игрок (hp <= 0): цель теряется и не выбирается заново (T-020)', () => {
  const mob = makeMob(0, 0);
  const player = makePlayer(2, 0);
  const runtime = { readyToAttackAtMs: 0 };
  const players = new Map([['s1', player]]);

  stepMob(mob, CONFIG, players, runtime, 1_000, TICK_MS);
  assert.equal(mob.targetId, 's1');

  player.hp = 0; // смерть наступила вне шага AI (T-016 заберёт игрока из state)
  stepMob(mob, CONFIG, players, runtime, 2_000, TICK_MS);
  assert.equal(mob.targetId, '', 'моб потерял цель-труп');
  assert.equal(player.hp, 0, 'по мёртвому игроку урон не идёт');

  // тот же мёртвый игрок не может стать новой целью
  mob.targetId = '';
  stepMob(mob, CONFIG, players, runtime, 3_000, TICK_MS);
  assert.equal(mob.targetId, '', 'перецеливания на мёртвого нет');
});

test('из смешанной компании выбирается ближайший живой, мёртвый пропускается', () => {
  const mob = makeMob(0, 0);
  const dead = makePlayer(1, 0, 0);
  const alive = makePlayer(4, 0);

  stepMob(
    mob,
    CONFIG,
    new Map([
      ['dead', dead],
      ['alive', alive],
    ]),
    { readyToAttackAtMs: 0 },
    1_000,
    TICK_MS,
  );

  assert.equal(mob.targetId, 'alive');
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
