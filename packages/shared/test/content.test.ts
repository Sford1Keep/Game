import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  parseItemConfig,
  parseMobConfig,
  toItemId,
  toMobId,
  type ItemConfig,
  type MobConfig,
} from '../src/index.js';

/**
 * Тестовый стаб T-009: файлы из `/content` читаются и типизируются через
 * `@game/shared` (TECH-SPEC 6, критерий приёмки). Путь от теста до корня —
 * `../../../content`, формат: JSON, имя файла = `id`.
 */

const readJson = (relativeFromHere: string): unknown =>
  JSON.parse(readFileSync(new URL(relativeFromHere, import.meta.url), 'utf8'));

test('content/items/scrap-machete.json — валидный ItemConfig', () => {
  const parsed = parseItemConfig(readJson('../../../content/items/scrap-machete.json'));
  assert.ok(parsed, 'конфиг предмета не распознан');
  const item: ItemConfig = parsed;
  assert.equal(item.id, toItemId('scrap-machete'));
  assert.equal(item.kind, 'weapon');
  assert.equal(item.faction, 'techno');
  assert.deepEqual(
    item.modifiers.map((m) => m.stat),
    ['damage', 'moveSpeed'],
  );
});

test('content/mobs/rust-scout.json — валидный MobConfig', () => {
  const parsed = parseMobConfig(readJson('../../../content/mobs/rust-scout.json'));
  assert.ok(parsed, 'конфиг моба не распознан');
  const mob: MobConfig = parsed;
  assert.equal(mob.id, toMobId('rust-scout'));
  assert.equal(mob.faction, 'techno');
  assert.ok(mob.hp > 0 && mob.damage > 0 && mob.moveSpeed > 0);
});

test('битые конфиги отклоняются целиком', () => {
  // неизвестная фракция, нечисловой модификатор, массив вместо объекта
  assert.equal(
    parseItemConfig({ id: 'x', name: 'x', kind: 'weapon', faction: 'zombie', modifiers: [] }),
    undefined,
  );
  assert.equal(
    parseItemConfig({
      id: 'x',
      name: 'x',
      kind: 'weapon',
      modifiers: [{ stat: 'damage', flat: '7', pct: 0 }],
    }),
    undefined,
  );
  assert.equal(parseItemConfig([]), undefined);
  assert.equal(parseMobConfig({ id: 'm', name: 'm', faction: 'magic', hp: 40 }), undefined);
});
