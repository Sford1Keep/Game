import type { MobConfig } from '@game/shared';

import { type MobState, type PlayerState } from './state.js';

type MobStateInstance = InstanceType<typeof MobState>;
type PlayerStateInstance = InstanceType<typeof PlayerState>;

/** Дистанция "моб вплотную к цели", с которой нанесимый удар считается попаданием (T-015). */
export const MOB_ATTACK_RANGE = 1.5;
/** Удары одного моба не чаще, чем раз в интервал; числа — серверные константы до баланса. */
export const MOB_ATTACK_INTERVAL_MS = 1_000;

/** Служебное состояние AI спавна, не реплицируется клиентам. */
export interface MobRuntime {
  readyToAttackAtMs: number;
}

const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

/**
 * Один тик AI одного спавна моба (T-015). Время входит параметрами
 * (`nowMs`/`dtMs`) — детерминированный юнит-тест без реальных таймеров,
 * по той же причине, по которой у `MovementController` инжектируемые часы.
 *
 * Правила: цели нет — выбираем ближайшего игрока в радиусе агро
 * (`aggroRadius` из конфига). Цель липкая, но теряется, когда игрок вышел за
 * радиус (койт от агро) или покинул комнату. Вне `MOB_ATTACK_RANGE` моб
 * сближается со `moveSpeed`, вплотную — бьёт раз в `MOB_ATTACK_INTERVAL_MS`
 * на `damage` из конфига. Смерть игрока (hp <= 0) здесь не обрабатывается —
 * это T-016.
 */
export const stepMob = (
  mob: MobStateInstance,
  config: MobConfig,
  players: ReadonlyMap<string, PlayerStateInstance>,
  runtime: MobRuntime,
  nowMs: number,
  dtMs: number,
): void => {
  let target: PlayerStateInstance | undefined =
    mob.targetId === '' ? undefined : players.get(mob.targetId);

  if (target !== undefined && distance(mob.x, mob.y, target.x, target.y) > config.aggroRadius) {
    target = undefined; // кайт: игрок вышел за радиус — цель сброшена
  }
  if (target === undefined) {
    let bestId = '';
    let best: PlayerStateInstance | undefined;
    let bestDistance = Infinity;
    for (const [id, player] of players) {
      const d = distance(mob.x, mob.y, player.x, player.y);
      if (d <= config.aggroRadius && d < bestDistance) {
        best = player;
        bestId = id;
        bestDistance = d;
      }
    }
    if (best === undefined) {
      mob.targetId = '';
      return;
    }
    mob.targetId = bestId;
    target = best;
  }

  const d = distance(mob.x, mob.y, target.x, target.y);
  if (d > MOB_ATTACK_RANGE) {
    // шаг сближения не больше оставшейся дистанции — без перелёта через цель
    const step = Math.min((config.moveSpeed * dtMs) / 1000, d);
    mob.x += ((target.x - mob.x) / d) * step;
    mob.y += ((target.y - mob.y) / d) * step;
    return;
  }
  if (runtime.readyToAttackAtMs > nowMs) {
    return;
  }
  target.hp -= config.damage;
  runtime.readyToAttackAtMs = nowMs + MOB_ATTACK_INTERVAL_MS;
};
