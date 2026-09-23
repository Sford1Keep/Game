import {
  toRoomEntityId,
  type AbilityStatus,
  type CombatantRef,
  type DamageInstance,
  type DamageType,
  type RoomEntityId,
} from '@game/shared';

import { StatusEffectState, type MobState, type PlayerState } from './state.js';

type MobStateInstance = InstanceType<typeof MobState>;
type PlayerStateInstance = InstanceType<typeof PlayerState>;

/**
 * Участник урона с доступом к своему state-объекту (T-016): HP обязан падать
 * там же, где берётся множитель и публикуется событие, — поэтому несём и ссылку
 * для клиента (`entityId`: `sessionId` игрока либо `RoomEntityId` спавна,
 * combat.ts), и сам реплицируемый объект.
 */
export type DamageTarget =
  | {
      readonly kind: 'player';
      readonly entityId: RoomEntityId;
      readonly state: PlayerStateInstance;
    }
  | { readonly kind: 'mob'; readonly entityId: RoomEntityId; readonly state: MobStateInstance };

export const playerTarget = (sessionId: string, state: PlayerStateInstance): DamageTarget => ({
  kind: 'player',
  entityId: toRoomEntityId(sessionId),
  state,
});

export const mobTarget = (mob: MobStateInstance): DamageTarget => ({
  kind: 'mob',
  entityId: toRoomEntityId(mob.entityId),
  state: mob,
});

/** Разовый урон: кто бил, кого, величина «до статусов» и тип из конфига. */
export interface DamageRequest {
  readonly source: DamageTarget;
  readonly target: DamageTarget;
  /** Базовая величина из `/content` (`AbilityConfig.damage`, `MobConfig.damage`). */
  readonly rawAmount: number;
  readonly type: DamageType;
}

/**
 * Готовый к передаче «нанести урон». Тип нужен, чтобы боевой тик (`stepMob`) и
 * обработчик способности звали одно и то же, а не имели по своей копии правила.
 */
export type DamageApplier = (request: DamageRequest) => void;

export interface DamageDeps {
  /** Часы комнаты, мс — та же шкала, что у `expiresAtMs` и `readyAtMs`. */
  now(): number;
  /** `event.damage` — разовое событие наружу (TECH-SPEC 4). */
  publish(damage: DamageInstance): void;
}

const toRef = (target: DamageTarget): CombatantRef => ({
  kind: target.kind,
  entityId: target.entityId,
});

/**
 * Множитель входящего урона по неистёкшим статусам цели. Берём максимум, а не
 * сумму: перезапись метки по её id не должна тайно усиливать урон вдвое.
 */
const statusMultiplier = (target: DamageTarget, nowMs: number): number => {
  if (target.kind !== 'mob') {
    return 1; // статусы Фазы 1 живут только на спавнах мобов (GDD 4)
  }
  let multiplier = 1;
  for (const status of target.state.statuses.values()) {
    if (status.expiresAtMs > nowMs) {
      multiplier = Math.max(multiplier, status.damageMultiplier);
    }
  }
  return multiplier;
};

/**
 * Единое применение урона (T-016): HP цели опускается, `event.damage` уходит
 * клиентам. Единственное место, где «HP опустился», — и удар моба, и реализация
 * способности проходят через него.
 */
export const applyDamage = (request: DamageRequest, deps: DamageDeps): void => {
  const nowMs = deps.now();
  const amount = request.rawAmount * statusMultiplier(request.target, nowMs);
  request.target.state.hp -= amount;
  deps.publish({
    source: toRef(request.source),
    target: toRef(request.target),
    amount,
    type: request.type,
  });
};

/** Привязка `applyDamage` к часам и каналу комнаты — то, что получает `stepMob`. */
export const createDamageApplier =
  (deps: DamageDeps): DamageApplier =>
  (request) => {
    applyDamage(request, deps);
  };

/**
 * Снятие истёкших статусов спавна. Держим в state, а не только в расчёте урона:
 * клиент (T-018) должен перестать рисовать метку, а не ждать следующего удара.
 */
export const expireStatuses = (mob: MobStateInstance, nowMs: number): void => {
  for (const [statusId, status] of mob.statuses) {
    if (status.expiresAtMs <= nowMs) {
      mob.statuses.delete(statusId);
    }
  }
};

/**
 * Статус способности на спавне: срок и множитель — из `/content`, ключ — id
 * статуса, поэтому повторная метка передвигает срок, а не складывается.
 */
export const applyStatus = (mob: MobStateInstance, status: AbilityStatus, nowMs: number): void => {
  const effect = new StatusEffectState();
  effect.statusId = status.status;
  effect.damageMultiplier = status.damageMultiplier;
  effect.expiresAtMs = nowMs + status.durationMs;
  mob.statuses.set(status.status, effect);
};
