import type { Id } from './ids.js';

/**
 * Боевая лексика (TECH-SPEC 4, 5; GDD 4): урон, статусы, кулдауны. Модуль
 * намеренно не знает ни Colyseus-состояния, ни БД — это только форма данных,
 * которую переносят между комнатой, API и клиентом. Чисел баланса здесь нет:
 * они в `/content` (TECH-SPEC 6), а `AbilityConfig` живёт в `content.ts`.
 */

/** Идентификатор способности; значения приходят из конфигов `/content/abilities` (T-013). */
export type AbilityId = Id<'Ability'>;

export const toAbilityId = (raw: string): AbilityId => raw as AbilityId;

/**
 * Тип урона. Единственная ось аффинити, зафиксированная в GDD пока, — фракционная:
 * аффикс предмета даёт бонус против мобов своей фракции (GDD 3), `neutral` — без
 * аффинити (классы фракционно нейтральны, GDD 5.1). Стихии/архетипы (GDD 5.2) —
 * отдельные значения, когда их введёт баланс.
 */
export const DAMAGE_TYPES = ['techno', 'magic', 'neutral'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/**
 * Идентичность участника боя внутри комнаты. Один и тот же `MobId` спавнится
 * несколько раз, поэтому ссылка идёт на сущность, а не на конфиг. Игроки в
 * комнате пока опознаются по `sessionId` (T-006); привязка к `CharacterId`
 * появится вместе с авторизацией инстансов.
 */
export type RoomEntityId = Id<'RoomEntity'>;

export const toRoomEntityId = (raw: string): RoomEntityId => raw as RoomEntityId;

export const COMBATANT_KINDS = ['player', 'mob'] as const;
export type CombatantKind = (typeof COMBATANT_KINDS)[number];

export type CombatantRef =
  | { readonly kind: 'player'; readonly entityId: RoomEntityId }
  | { readonly kind: 'mob'; readonly entityId: RoomEntityId };

/** Разовый урон (TECH-SPEC 4, `event.damage`): источник, цель, величина и тип. */
export interface DamageInstance {
  readonly source: CombatantRef;
  readonly target: CombatantRef;
  readonly amount: number;
  readonly type: DamageType;
}

/**
 * Статус-эффект на участнике боя. `vulnerable` — первый и единственный на Фазе 1
 * (GDD 4, «кооп-синергия через статусы»): входящий урон множится на
 * `damageMultiplier` до `expiresAtMs`. Множитель хранится у самого эффекта, чтобы
 * расчёт урона (T-016) не тянул конфиг способности, которая статус наложила.
 */
export const STATUS_EFFECT_IDS = ['vulnerable'] as const;
export type StatusEffectId = (typeof STATUS_EFFECT_IDS)[number];

export interface StatusEffect {
  readonly id: StatusEffectId;
  /** Метка времени постановки, мс — та же шкала, что у `readyAtMs` и `expiresAtMs`. */
  readonly appliedAtMs: number;
  readonly expiresAtMs: number;
  readonly damageMultiplier: number;
}

/**
 * Кулдаун способности: когда она снова готова, в той же шкале времени, что и
 * `StatusEffect.expiresAtMs`. Сервер держит его авторитетно (TECH-SPEC 4), клиент —
 * копию для локального фидбека (T-017).
 */
export interface AbilityCooldown {
  readonly abilityId: AbilityId;
  readonly readyAtMs: number;
}
