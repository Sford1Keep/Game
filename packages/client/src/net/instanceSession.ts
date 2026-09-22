import { Client } from '@colyseus/sdk';
import { InstanceState } from '@game/server-instance/state';

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
    leave: async () => {
      await room.leave(true);
    },
  };
};
