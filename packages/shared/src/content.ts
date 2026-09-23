import {
  DAMAGE_TYPES,
  STATUS_EFFECT_IDS,
  toAbilityId,
  type AbilityId,
  type DamageType,
  type StatusEffectId,
} from './combat.js';
import type { Id } from './ids.js';

/**
 * Схема контент-конфигов (`/content`, TECH-SPEC 6): предметы, мобы и способности —
 * данные, а не код. Формат файлов: JSON, один файл = одна сущность, имя файла = `id`.
 * Типизированное чтение — через парсеры ниже: они единственная граница, где
 * произвольный `unknown` из файла превращается в конфиг или отклоняется.
 */

/** Идентификатор предмета/моба из конфига; `id` внутри файла должен совпадать с именем файла. */
export type ItemId = Id<'Item'>;
export type MobId = Id<'Mob'>;

export const toItemId = (raw: string): ItemId => raw as ItemId;
export const toMobId = (raw: string): MobId => raw as MobId;

/** Две фракции мира (GDD 2); классы игроков фракционно нейтральны. */
export const FACTIONS = ['techno', 'magic'] as const;
export type Faction = (typeof FACTIONS)[number];

export const ITEM_KINDS = ['weapon', 'armor', 'consumable', 'material'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Статы, которые предмет может модифицировать. Числа баланса — в конфигах, не здесь. */
export const STAT_IDS = ['damage', 'armor', 'maxHp', 'moveSpeed'] as const;
export type StatId = (typeof STAT_IDS)[number];

/** Модификатор стата: `flat` — абсолютная прибавка, `pct` — проценты от базы (10 = +10%). */
export interface ItemModifier {
  stat: StatId;
  flat: number;
  pct: number;
}

export interface ItemConfig {
  id: ItemId;
  name: string;
  kind: ItemKind;
  /** Фракционный аффикс (GDD 3): бонус против мобов этой фракции; нет — нейтральный. */
  faction?: Faction;
  modifiers: readonly ItemModifier[];
  /** Арт подключается позже (TECH-SPEC 6): ссылка на spriteId, которого может не быть. */
  spriteId?: string;
}

export interface MobConfig {
  id: MobId;
  name: string;
  faction: Faction;
  hp: number;
  damage: number;
  /** Скорость в мировых единицах/сек — та же шкала, что у движения клиента. */
  moveSpeed: number;
  /** Радиус агро (мировые единицы): с этого расстояния моб начинает выбирать цель (T-015). */
  aggroRadius: number;
  /**
   * Радиус сброса агро; строго больше `aggroRadius` — гистерезис (T-020): цель
   * удерживается между радиусами и теряется только за `resetRadius`. Иначе моб
   * мигал бы целью на границе агро, преследуя игрока по кругу.
   */
  resetRadius: number;
  /** Дистанция удара (мировые единицы): ближе неё моб считает цель достигнутой. */
  attackRange: number;
  /** Пауза между ударами одного моба, мс. */
  attackIntervalMs: number;
  /** Награда за убийство (GDD 5): валюта и опыт. */
  gold: number;
  xp: number;
  spriteId?: string;
}

export const MECHANIC_IDS = ['dodge'] as const;
export type MechanicId = (typeof MECHANIC_IDS)[number];

/**
 * Конфиг игровой механики (T-020): уклонение — не `AbilityConfig` (нет цели
 * и урона), но её параметры тоже баланс и тоже живут в `/content`, файл
 * `content/mechanics/<id>.json`.
 */
export interface DodgeConfig {
  id: MechanicId;
  name: string;
  /** Длина рывка в мировых единицах — та же шкала, что у `range` способностей. */
  distance: number;
  cooldownMs: number;
}

export type ClassId = Id<'Class'>;

export const toClassId = (raw: string): ClassId => raw as ClassId;

/**
 * Конфиг класса игрока (GDD 5.1 — классы фракционно нейтральны). На T-020 —
 * один класс-заглушка: персонажной системы ещё нет (T-004), но стартовые HP
 * игрока уже обязаны приходить из `/content`, а не из константы комнаты.
 */
export interface ClassConfig {
  id: ClassId;
  name: string;
  maxHp: number;
  spriteId?: string;
}

/**
 * Конфиг активной способности (GDD 4, T-013 держит сами файлы). Дистанция и
 * радиус — разные вещи: `range` отстоит источник от цели, `radius` описывает
 * площадь вокруг цели (`0` — одиночная цель).
 */
export interface AbilityConfig {
  id: AbilityId;
  name: string;
  /** Базовая величина урона; модификаторы статов и статусы применяются поверх (T-016). */
  damage: number;
  damageType: DamageType;
  cooldownMs: number;
  range: number;
  radius: number;
  /** Статус, который способность накладывает на цель (GDD 4, «метка/уязвимость»). */
  appliesStatus?: AbilityStatus;
  spriteId?: string;
}

/** Статус в конфиге способности: `damageMultiplier` попадает в `StatusEffect` (combat.ts). */
export interface AbilityStatus {
  status: StatusEffectId;
  durationMs: number;
  damageMultiplier: number;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const finiteNumber = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;

/** Числа баланса: отрицательная дистанция или кулдаун — ошибка конфига, а не смысл. */
const nonNegativeNumber = (raw: unknown): number | undefined => {
  const value = finiteNumber(raw);
  return value !== undefined && value >= 0 ? value : undefined;
};

const positiveNumber = (raw: unknown): number | undefined => {
  const value = finiteNumber(raw);
  return value !== undefined && value > 0 ? value : undefined;
};

const oneOf = <T extends string>(raw: unknown, allowed: readonly T[]): T | undefined =>
  typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as (typeof allowed)[number])
    : undefined;

const nonEmptyString = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.length > 0 ? raw : undefined;

const parseModifier = (raw: unknown): ItemModifier | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const stat = oneOf(raw.stat, STAT_IDS);
  const flat = finiteNumber(raw.flat);
  const pct = finiteNumber(raw.pct);
  return stat !== undefined && flat !== undefined && pct !== undefined
    ? { stat, flat, pct }
    : undefined;
};

/** Полный контроль конфига предмета; любая ошибка — `undefined` (файл бракуется целиком). */
export const parseItemConfig = (raw: unknown): ItemConfig | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = nonEmptyString(raw.id);
  const name = nonEmptyString(raw.name);
  const kind = oneOf(raw.kind, ITEM_KINDS);
  if (id === undefined || name === undefined || kind === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw.modifiers)) {
    return undefined;
  }
  const modifiers: ItemModifier[] = [];
  for (const entry of raw.modifiers) {
    const modifier = parseModifier(entry);
    if (modifier === undefined) {
      return undefined;
    }
    modifiers.push(modifier);
  }
  const faction = raw.faction === undefined ? undefined : oneOf(raw.faction, FACTIONS);
  if (raw.faction !== undefined && faction === undefined) {
    return undefined;
  }
  const spriteId = raw.spriteId === undefined ? undefined : nonEmptyString(raw.spriteId);
  if (raw.spriteId !== undefined && spriteId === undefined) {
    return undefined;
  }
  return {
    id: toItemId(id),
    name,
    kind,
    modifiers,
    ...(faction !== undefined ? { faction } : {}),
    ...(spriteId !== undefined ? { spriteId } : {}),
  };
};

/** Полный контроль конфига моба. */
export const parseMobConfig = (raw: unknown): MobConfig | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = nonEmptyString(raw.id);
  const name = nonEmptyString(raw.name);
  const faction = oneOf(raw.faction, FACTIONS);
  const hp = finiteNumber(raw.hp);
  const damage = finiteNumber(raw.damage);
  const moveSpeed = finiteNumber(raw.moveSpeed);
  const aggroRadius = nonNegativeNumber(raw.aggroRadius);
  const resetRadius = finiteNumber(raw.resetRadius);
  const attackRange = nonNegativeNumber(raw.attackRange);
  const attackIntervalMs = positiveNumber(raw.attackIntervalMs);
  const gold = finiteNumber(raw.gold);
  const xp = finiteNumber(raw.xp);
  if (
    id === undefined ||
    name === undefined ||
    faction === undefined ||
    hp === undefined ||
    damage === undefined ||
    moveSpeed === undefined ||
    aggroRadius === undefined ||
    resetRadius === undefined ||
    attackRange === undefined ||
    attackIntervalMs === undefined ||
    gold === undefined ||
    xp === undefined
  ) {
    return undefined;
  }
  // Гистерезис агро (T-020): радиус сброса обязан строго превышать радиус захвата.
  if (resetRadius <= aggroRadius) {
    return undefined;
  }
  const spriteId = raw.spriteId === undefined ? undefined : nonEmptyString(raw.spriteId);
  if (raw.spriteId !== undefined && spriteId === undefined) {
    return undefined;
  }
  return {
    id: toMobId(id),
    name,
    faction,
    hp,
    damage,
    moveSpeed,
    aggroRadius,
    resetRadius,
    attackRange,
    attackIntervalMs,
    gold,
    xp,
    ...(spriteId !== undefined ? { spriteId } : {}),
  };
};

/** Контроль конфига уклонения: механики вне `MECHANIC_IDS` и нулевой разбег — брак. */
export const parseDodgeConfig = (raw: unknown): DodgeConfig | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = oneOf(raw.id, MECHANIC_IDS);
  const name = nonEmptyString(raw.name);
  const distance = positiveNumber(raw.distance);
  const cooldownMs = positiveNumber(raw.cooldownMs);
  if (
    id === undefined ||
    name === undefined ||
    distance === undefined ||
    cooldownMs === undefined
  ) {
    return undefined;
  }
  return { id, name, distance, cooldownMs };
};

/** Контроль конфига класса: `maxHp` обязателен и положителен — от него живут стартовые HP. */
export const parseClassConfig = (raw: unknown): ClassConfig | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = nonEmptyString(raw.id);
  const name = nonEmptyString(raw.name);
  const maxHp = positiveNumber(raw.maxHp);
  if (id === undefined || name === undefined || maxHp === undefined) {
    return undefined;
  }
  const spriteId = raw.spriteId === undefined ? undefined : nonEmptyString(raw.spriteId);
  if (raw.spriteId !== undefined && spriteId === undefined) {
    return undefined;
  }
  return {
    id: toClassId(id),
    name,
    maxHp,
    ...(spriteId !== undefined ? { spriteId } : {}),
  };
};

const parseAbilityStatus = (raw: unknown): AbilityStatus | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const status = oneOf(raw.status, STATUS_EFFECT_IDS);
  const durationMs = positiveNumber(raw.durationMs);
  const damageMultiplier = positiveNumber(raw.damageMultiplier);
  return status !== undefined && durationMs !== undefined && damageMultiplier !== undefined
    ? { status, durationMs, damageMultiplier }
    : undefined;
};

/** Контроль конфига способности; `appliesStatus` при отсутствии — урон без статуса. */
export const parseAbilityConfig = (raw: unknown): AbilityConfig | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const id = nonEmptyString(raw.id);
  const name = nonEmptyString(raw.name);
  const damage = nonNegativeNumber(raw.damage);
  const damageType = oneOf(raw.damageType, DAMAGE_TYPES);
  const cooldownMs = nonNegativeNumber(raw.cooldownMs);
  const range = nonNegativeNumber(raw.range);
  const radius = nonNegativeNumber(raw.radius);
  if (
    id === undefined ||
    name === undefined ||
    damage === undefined ||
    damageType === undefined ||
    cooldownMs === undefined ||
    range === undefined ||
    radius === undefined
  ) {
    return undefined;
  }
  const appliesStatus = parseAbilityStatus(raw.appliesStatus);
  if (raw.appliesStatus !== undefined && appliesStatus === undefined) {
    return undefined;
  }
  const spriteId = raw.spriteId === undefined ? undefined : nonEmptyString(raw.spriteId);
  if (raw.spriteId !== undefined && spriteId === undefined) {
    return undefined;
  }
  return {
    id: toAbilityId(id),
    name,
    damage,
    damageType,
    cooldownMs,
    range,
    radius,
    ...(appliesStatus !== undefined ? { appliesStatus } : {}),
    ...(spriteId !== undefined ? { spriteId } : {}),
  };
};
