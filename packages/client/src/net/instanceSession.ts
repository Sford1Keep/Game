import { Client } from '@colyseus/sdk';
import { InstanceState } from '@game/server-instance/state';
import type { Vector2 } from '@game/shared';

import type { WorldMob, WorldPlayer, WorldStore } from '../game-core/world.js';

/**
 * Сетевой адаптер: единственный слой клиента, знающий про Colyseus. Переводит
 * state комнаты в game-core (`WorldStore`), чтобы остальной game-core и рендер
 * не зависели от транспорта (TECH-SPEC 1, 3).
 */
export interface InstanceSession {
  sessionId: string;
  /** Опрос обновлений state — вызывается из цикла рендера. */
  sync(): void;
  /** Намерение движения на сервер (TECH-SPEC 4): смещение dx/dy. */
  sendMove(dx: number, dy: number): void;
  /** `intent.ability` (T-014): активация способности по id из `/content/abilities`. */
  sendAbility(abilityId: string): void;
  /** `intent.dodge` (T-014): направление рывка; длину сервер нормализует сам. */
  sendDodge(dir: Vector2): void;
  leave(): Promise<void>;
}

export const connectInstance = async (
  serverUrl: string,
  roomName: string,
  world: WorldStore,
): Promise<InstanceSession> => {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate(roomName, undefined, InstanceState);

  room.onMessage('event.damage', (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) data[key] = value;
    const target = data.target;
    const targetId =
      typeof data.targetId === 'string'
        ? data.targetId
        : typeof target === 'object' && target !== null && 'entityId' in target
          ? typeof target.entityId === 'string'
            ? target.entityId
            : undefined
          : undefined;
    const amount = typeof data.amount === 'number' ? data.amount : undefined;
    if (targetId !== undefined && amount !== undefined) {
      world.addDamage({ targetId, amount });
    }
  });

  return {
    sessionId: room.sessionId,
    sync(): void {
      const players: WorldPlayer[] = [];
      for (const [id, player] of room.state.players) {
        players.push({
          id,
          position: { x: player.x, y: player.y },
          hp: player.hp,
          maxHp: player.hp,
        });
      }
      const mobs: WorldMob[] = [];
      for (const [id, mob] of room.state.mobs) {
        mobs.push({
          id,
          position: { x: mob.x, y: mob.y },
          hp: mob.hp,
          maxHp: mob.hp,
          statuses: [...mob.statuses.values()].map((status) => status.statusId),
        });
      }
      world.replace(players, mobs);
    },
    sendMove(dx: number, dy: number): void {
      room.send('intent.move', { dx, dy });
    },
    sendAbility(abilityId: string): void {
      room.send('intent.ability', { abilityId });
    },
    sendDodge(dir: Vector2): void {
      room.send('intent.dodge', { dirX: dir.x, dirY: dir.y });
    },
    leave: async () => {
      await room.leave(true);
    },
  };
};
