import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  parseAbilityConfig,
  parseItemConfig,
  parseMobConfig,
  toAbilityId,
  toItemId,
  toMobId,
  type AbilityConfig,
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

/** Стаб-пример из T-012; реальные файлы `content/abilities/` — ниже, за ними приёмка T-013. */
const ABILITY_JSON = `{
  "id": "rust-jab",
  "name": "Ржавый джеб",
  "damage": 9,
  "damageType": "techno",
  "cooldownMs": 1200,
  "range": 2.5,
  "radius": 0,
  "appliesStatus": { "status": "vulnerable", "durationMs": 4000, "damageMultiplier": 1.25 }
}`;

test('AbilityConfig — парсится из JSON, включая статус', () => {
  const parsed = parseAbilityConfig(JSON.parse(ABILITY_JSON));
  assert.ok(parsed, 'конфиг способности не распознан');
  const ability: AbilityConfig = parsed;
  assert.equal(ability.id, toAbilityId('rust-jab'));
  assert.equal(ability.damageType, 'techno');
  assert.equal(ability.cooldownMs, 1200);
  assert.deepEqual(ability.appliesStatus, {
    status: 'vulnerable',
    durationMs: 4000,
    damageMultiplier: 1.25,
  });
});

test('AbilityConfig без appliesStatus — поля статуса нет вовсе', () => {
  const raw = JSON.parse(ABILITY_JSON) as Record<string, unknown>;
  delete raw.appliesStatus;
  const parsed = parseAbilityConfig(raw);
  assert.ok(parsed);
  // exactOptionalPropertyTypes: `undefined` в поле недопустим, ключ должен отсутствовать.
  assert.equal('appliesStatus' in parsed, false);
});

test('битые AbilityConfig отклоняются целиком', () => {
  const base = JSON.parse(ABILITY_JSON) as Record<string, unknown>;
  const broken = (changes: Record<string, unknown>): unknown =>
    parseAbilityConfig({ ...base, ...changes });

  assert.equal(broken({ damageType: 'fire' }), undefined); // вне DAMAGE_TYPES
  assert.equal(broken({ cooldownMs: -1 }), undefined); // отрицательный кулдаун
  assert.equal(broken({ radius: '2' }), undefined); // строка вместо числа
  assert.equal(broken({ range: Number.NaN }), undefined);
  assert.equal(broken({ id: '' }), undefined);
  delete base.radius;
  assert.equal(parseAbilityConfig(base), undefined); // обязательная дистанция площади
  // статус: неизвестный id, нулевой множитель, отсутствующая длительность
  assert.equal(
    parseAbilityConfig({
      ...JSON.parse(ABILITY_JSON),
      appliesStatus: { status: 'stunned', durationMs: 1000, damageMultiplier: 1.25 },
    }),
    undefined,
  );
  assert.equal(
    parseAbilityConfig({
      ...JSON.parse(ABILITY_JSON),
      appliesStatus: { status: 'vulnerable', durationMs: 1000, damageMultiplier: 0 },
    }),
    undefined,
  );
  assert.equal(
    parseAbilityConfig({
      ...JSON.parse(ABILITY_JSON),
      appliesStatus: { status: 'vulnerable', damageMultiplier: 1.25 },
    }),
    undefined,
  );
});

test('MobConfig требует aggroRadius, rust-scout его несёт', () => {
  const parsed = parseMobConfig(readJson('../../../content/mobs/rust-scout.json'));
  assert.ok(parsed);
  const { aggroRadius, ...withoutAggro } = parsed;
  assert.ok(aggroRadius > 0);
  assert.equal(parseMobConfig(withoutAggro), undefined);
});

test('content/abilities/rust-jab.json — валидный AbilityConfig ближней атаки', () => {
  const parsed = parseAbilityConfig(readJson('../../../content/abilities/rust-jab.json'));
  assert.ok(parsed, 'конфиг способности не распознан');
  const ability: AbilityConfig = parsed;
  assert.equal(ability.id, toAbilityId('rust-jab')); // имя файла = id
  assert.equal(ability.radius, 0); // одиночная цель
  assert.ok(ability.range > 0 && ability.cooldownMs > 0);
  assert.equal('appliesStatus' in ability, false); // базовая атака без статуса
});

test('content/abilities/marker-shot.json — AbilityConfig со статусом vulnerable', () => {
  const parsed = parseAbilityConfig(readJson('../../../content/abilities/marker-shot.json'));
  assert.ok(parsed, 'конфиг способности не распознан');
  const ability: AbilityConfig = parsed;
  assert.equal(ability.id, toAbilityId('marker-shot'));
  assert.ok(ability.range > 2.5, 'атака дальника: дистанция больше ближней атаки');
  assert.deepEqual(ability.appliesStatus, {
    status: 'vulnerable',
    durationMs: 5000,
    damageMultiplier: 1.25,
  });
});
