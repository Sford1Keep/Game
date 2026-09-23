import type { MobConfig } from '@game/shared';

import { type MobState, type PlayerState } from './state.js';

type MobStateInstance = InstanceType<typeof MobState>;
type PlayerStateInstance = InstanceType<typeof PlayerState>;

/** Служебное состояние AI спавна, не реплицируется клиентам. */
export interface MobRuntime {
  readyToAttackAtMs: number;
}

const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

/**
 * Один тик AI одного спавна моба (T-015). Все числа боя — из `MobConfig`
 * (`/content/mobs`, T-020), в коде их нет. Время входит параметрами
 * (`nowMs`/`dtMs`) — детерминированный юнит-тест без реальных таймеров,
 * по той же причине, по которой у `MovementController` инжектируемые часы.
 *
 * Правила: цели нет — выбираем ближайшего живого (`hp > 0`) игрока в радиусе
 * агро (`aggroRadius`). Цель липкая с гистерезисом (T-020): удерживается, пока
 * игрок не вышел за `resetRadius` (>`aggroRadius`), — иначе моб мигал бы целью
 * на границе агро. Цель также теряется, когда игрок покинул комнату или умер
 * (`hp <= 0`); на мёртвого игрока моб не перецеливается — респавна игроков нет
 * (T-020). Вне `attackRange` моб сближается со `moveSpeed`, вплотную — бьёт
 * раз в `attackIntervalMs` на `damage` из конфига.
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

  if (
    target !== undefined &&
    (target.hp <= 0 || distance(mob.x, mob.y, target.x, target.y) > config.resetRadius)
  ) {
    target = undefined; // кайт за resetRadius или смерть цели — цель сброшена
  }
  if (target === undefined) {
    let bestId = '';
    let best: PlayerStateInstance | undefined;
    let bestDistance = Infinity;
    for (const [id, player] of players) {
      if (player.hp <= 0) {
        continue; // мёртвый игрок не может стать целью (T-020)
      }
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
  if (d > config.attackRange) {
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
  runtime.readyToAttackAtMs = nowMs + config.attackIntervalMs;
};
