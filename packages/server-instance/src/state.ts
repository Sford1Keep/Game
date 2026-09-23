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
 * Состояние одного игрока в комнате; поля реплицируются клиентам через
 * schema sync (TECH-SPEC 4). Schema 5.x: декларативный `schema()` + `t.*`
 * без decorators — совместимо со strict-конфигом репозитория.
 */
export const PlayerState = schema(
  {
    x: t.number().default(0),
    y: t.number().default(0),
    // ключ MapSchema — abilityId; для уклонения — служебный ключ DODGE_COOLDOWN_KEY
    cooldowns: t.map(AbilityCooldownState),
  },
  'PlayerState',
);

/** State комнаты-инстанса: игроки, ключ MapSchema — `sessionId` клиента. */
export const InstanceState = schema({ players: t.map(PlayerState) }, 'InstanceState');
