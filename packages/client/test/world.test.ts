import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WorldStore } from '../src/game-core/world.js';

test('world replaces players and mobs, removing entities absent from state', () => {
  const world = new WorldStore();
  world.replace(
    [{ id: 'p', position: { x: 1, y: 2 }, hp: 5, maxHp: 10 }],
    [{ id: 'm', position: { x: 3, y: 4 }, hp: 2, maxHp: 4, statuses: ['vulnerable'] }],
  );
  assert.equal(world.roster()[0]?.hp, 5);
  assert.equal(world.mobRoster()[0]?.statuses[0], 'vulnerable');
  world.replace([], []);
  assert.equal(world.roster().length, 0);
  assert.equal(world.mobRoster().length, 0);
});

test('damage events are queued and drained once', () => {
  const world = new WorldStore();
  world.addDamage({ targetId: 'm', amount: 12 });
  world.addDamage({ targetId: '', amount: 2 });
  assert.deepEqual(world.drainDamage(), [{ targetId: 'm', amount: 12 }]);
  assert.deepEqual(world.drainDamage(), []);
});
