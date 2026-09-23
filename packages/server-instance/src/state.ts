import { schema, t } from '@colyseus/schema';

import type { Vector2 } from '@game/shared';

/**
 * Точка появления игрока при входе в инстанс. На Фазе 0 зон/карт нет, поэтому
 * спавн один на все комнаты; тип — `Vector2` из shared, чтобы позже источник
 * позиции стал конфигом контента (TECH-SPEC 6).
 */
export const SPAWN_POINT: Vector2 = { x: 0, y: 0 };

/**
 * Кулдаун одной способности в реплицированном виде — рантайм-аналог
 * `AbilityCooldown` из shared (T-012): клиент по `readyAtMs` держит локальный
 * фидбек (T-017), авторитетом остаётся сервер (TECH-SPEC 4).
 */
export const AbilityCooldownState = schema(
  { abilityId: t.string(), readyAtMs: t.number().default(0) },
  'AbilityCooldownState',
);

/**
 * Активный статус спавна моба в реплицированном виде — рантайм-аналог
 * `StatusEffect` из shared (T-012, T-016): `vulnerable` множит входящий урон на
 * `damageMultiplier` до `expiresAtMs`. Клиент по нему рисует индикатор (T-018),
 * авторитет — сервер (TECH-SPEC 4).
 */
export const StatusEffectState = schema(
  {
    statusId: t.string(),
    damageMultiplier: t.number().default(1),
    expiresAtMs: t.number().default(0),
  },
  'StatusEffectState',
);

/**
 * Состояние одного игрока в комнате; поля реплицируются клиентам через
 * schema sync (TECH-SPEC 4). Schema 5.x: декларативный `schema()` + `t.*`
 * без decorators — совместимо со strict-конфигом репозитория.
 */
export const PlayerState = schema(
  {
    x: t.number().default(0),
    y: t.number().default(0),
    // HP игрока: база — maxHp класса-заглушки из /content/classes (T-020),
    // персонажа в комнату не приносим — на join есть только sessionId
    hp: t.number().default(0),
    // ключ MapSchema — abilityId; для уклонения — служебный ключ DODGE_COOLDOWN_KEY
    cooldowns: t.map(AbilityCooldownState),
  },
  'PlayerState',
);

/**
 * Состояние одного спавна моба (T-015). Ключ в `InstanceState.mobs` —
 * `RoomEntityId` (`rust-scout#1`): один `MobId`-конфиг спавнится несколько раз,
 * поэтому сущность нумеруется (combat.ts, T-012). `targetId` — `sessionId`
 * игрока или пустая строка, «цели нет».
 */
export const MobState = schema(
  {
    entityId: t.string(),
    mobId: t.string(),
    x: t.number().default(0),
    y: t.number().default(0),
    hp: t.number().default(0),
    targetId: t.string().default(''),
    // ключ MapSchema — id статуса (`vulnerable`); множители читает расчёт урона (T-016)
    statuses: t.map(StatusEffectState),
  },
  'MobState',
);

/** State комнаты-инстанса: игроки и мобы, ключ MapSchema — `sessionId` / `RoomEntityId`. */
export const InstanceState = schema(
  { players: t.map(PlayerState), mobs: t.map(MobState) },
  'InstanceState',
);
