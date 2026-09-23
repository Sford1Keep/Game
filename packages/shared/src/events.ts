import { type CharacterId, type InstanceId, toCharacterId, toInstanceId } from './ids.js';

/**
 * Игровые события (TECH-SPEC 10.2, T-011): сырой источник правды для статистики,
 * экономики и будущего античита. Это данные, а не диагностический лог, — они
 * append-only и живут дольше логов. Пишет их `server-api`; `server-instance`
 * в БД напрямую не ходит (TECH-SPEC 2).
 */

/**
 * Типы событий на старте фазы. `item.looted` зарезервирован заранее: самого лута
 * в Фазе 1 ещё нет, но менять из-за него формат записи не нужно.
 */
export const GAME_EVENT_TYPES = ['mob.killed', 'item.looted'] as const;
export type GameEventType = (typeof GAME_EVENT_TYPES)[number];

export interface GameEvent {
  type: GameEventType;
  /** Кто произвёл событие — персонаж-актор. */
  actorId: CharacterId;
  /** Структура зависит от `type`; для `mob.killed` это хотя бы `mobId`. */
  payload: Record<string, unknown>;
  /** Где произошло; события вне инстанса (аукцион, профиль) — `null`. */
  instanceId: InstanceId | null;
  timestamp: Date;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const isNonEmptyString = (raw: unknown): raw is string => typeof raw === 'string' && raw.length > 0;

const isEventType = (raw: unknown): raw is GameEventType =>
  typeof raw === 'string' && (GAME_EVENT_TYPES as readonly string[]).includes(raw);

const toTimestamp = (raw: unknown): Date | undefined => {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? undefined : raw;
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

/**
 * Граница `unknown → GameEvent`: всё, что не проходит схему, отклоняется целиком,
 * включая payload не-объект и неизвестный `type` (по образцу парсеров контент-конфигов).
 */
export const parseGameEvent = (raw: unknown): GameEvent | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { type, actorId, payload, instanceId, timestamp } = raw;
  if (!isEventType(type) || !isNonEmptyString(actorId)) {
    return undefined;
  }
  if (!isRecord(payload)) {
    return undefined;
  }
  if (instanceId !== null && !isNonEmptyString(instanceId)) {
    return undefined;
  }
  const when = toTimestamp(timestamp);
  if (when === undefined) {
    return undefined;
  }
  return {
    type,
    actorId: toCharacterId(actorId),
    payload,
    instanceId: instanceId === null ? null : toInstanceId(instanceId),
    timestamp: when,
  };
};
