/**
 * Точка входа `@game/shared`. Всё, что доступно другим пакетам, реэкспортируется
 * отсюда (TECH-SPEC 3, 7).
 */
export type { Vector2 } from './geometry.js';
export type { Id, AccountId, CharacterId, InstanceId } from './ids.js';
export { toAccountId, toCharacterId, toInstanceId } from './ids.js';
export { AccountStatus, CharacterStatus } from './status.js';
export type {
  ItemId,
  MobId,
  Faction,
  ItemKind,
  StatId,
  ItemModifier,
  ItemConfig,
  MobConfig,
} from './content.js';
export {
  FACTIONS,
  ITEM_KINDS,
  STAT_IDS,
  toItemId,
  toMobId,
  parseItemConfig,
  parseMobConfig,
} from './content.js';
