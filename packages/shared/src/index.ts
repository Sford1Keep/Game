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
  AbilityConfig,
  AbilityStatus,
  MechanicId,
  DodgeConfig,
  ClassId,
  ClassConfig,
} from './content.js';
export {
  FACTIONS,
  ITEM_KINDS,
  STAT_IDS,
  MECHANIC_IDS,
  toItemId,
  toMobId,
  toClassId,
  parseItemConfig,
  parseMobConfig,
  parseAbilityConfig,
  parseDodgeConfig,
  parseClassConfig,
} from './content.js';
export type {
  AbilityId,
  DamageType,
  RoomEntityId,
  CombatantKind,
  CombatantRef,
  DamageInstance,
  StatusEffectId,
  StatusEffect,
  AbilityCooldown,
} from './combat.js';
export {
  DAMAGE_TYPES,
  STATUS_EFFECT_IDS,
  COMBATANT_KINDS,
  toAbilityId,
  toRoomEntityId,
} from './combat.js';
export type { GameEventType, GameEvent } from './events.js';
export { GAME_EVENT_TYPES, parseGameEvent } from './events.js';
export type { LogLevel, LoggerContext, LoggerOptions } from './logging.js';
export type { Logger as GameLogger } from 'pino';
export { LOG_LEVELS, createLogger, parseLogLevel, resolveLogLevel } from './logging.js';
