import { Client } from '@colyseus/sdk';
import { InstanceState } from '@game/server-instance/state';
import type { Vector2 } from '@game/shared';

import type { WorldStore } from '../game-core/world.js';

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
  /** Кулдауны локального игрока из авторитетного state (ключ → readyAtMs, T-017). */
  localCooldowns(): Array<{ key: string; readyAtMs: number }>;
  leave(): Promise<void>;
}

export const connectInstance = async (
  serverUrl: string,
  roomName: string,
  world: WorldStore,
): Promise<InstanceSession> => {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate(roomName, undefined, InstanceState);

  return {
    sessionId: room.sessionId,
    sync(): void {
      const players = [];
      for (const [id, p] of room.state.players) {
        players.push({ id, position: { x: p.x, y: p.y } });
      }
      world.replace(players);
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
    localCooldowns(): Array<{ key: string; readyAtMs: number }> {
      const cooldowns: Array<{ key: string; readyAtMs: number }> = [];
      const local = room.state.players.get(room.sessionId);
      if (local !== undefined) {
        for (const [key, c] of local.cooldowns) {
          cooldowns.push({ key, readyAtMs: c.readyAtMs });
        }
      }
      return cooldowns;
    },
    leave: async () => {
      await room.leave(true);
    },
  };
};
