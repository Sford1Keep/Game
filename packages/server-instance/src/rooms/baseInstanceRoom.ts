import { type Client, Room } from 'colyseus';

import { parseMoveIntent } from '../messages.js';
import { InstanceState, PlayerState, SPAWN_POINT } from '../state.js';

/**
 * Комната инстанса: жизненный цикл Colyseus, репликация позиции игрока в state
 * (T-005) и авторитетное применение намерения движения (T-006).
 * Сервер — источник истины по позициям (TECH-SPEC 1, 4): `intent.move`
 * применяет смещение к состоянию игрока, дельты расходятся встроенным state
 * sync. Коллизии/физика/тики боёвки — следующие фазы, здесь их намеренно нет.
 */
export class BaseInstanceRoom extends Room<{ state: InstanceType<typeof InstanceState> }> {
  override onCreate(): void {
    this.state = new InstanceState();

    this.onMessage('intent.move', (client, raw: unknown) => {
      const intent = parseMoveIntent(raw);
      const player = this.state.players.get(client.sessionId);
      if (intent === undefined || player === undefined) {
        console.warn(`[server-instance] отклонён intent.move от ${client.sessionId}`);
        return;
      }
      player.x += intent.dx;
      player.y += intent.dy;
    });

    console.warn(`[server-instance] комната создана: ${this.roomId}`);
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.x = SPAWN_POINT.x;
    player.y = SPAWN_POINT.y;
    this.state.players.set(client.sessionId, player);
    console.warn(
      `[server-instance] join ${client.sessionId}, в комнате: ${this.state.players.size}`,
    );
  }

  override onLeave(client: Client): void {
    // allowReconnect не подключаем: auth/reconnect вне скоупа Фазы 0 (TECH-SPEC 10).
    this.state.players.delete(client.sessionId);
    console.warn(
      `[server-instance] leave ${client.sessionId}, в комнате: ${this.state.players.size}`,
    );
  }

  override onDispose(): void {
    console.warn(`[server-instance] комната уничтожена: ${this.roomId}`);
  }
}
