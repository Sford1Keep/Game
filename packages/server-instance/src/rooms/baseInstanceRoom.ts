import { type Client, Room } from 'colyseus';

import { InstanceState, PlayerState, SPAWN_POINT } from '../state.js';

/**
 * Минимальная комната инстанса (T-005): жизненный цикл Colyseus и репликация
 * позиции игрока в state. Обработка намерений (`intent.move`) и боёвка —
 * следующие задачи (T-006+), здесь их намеренно нет.
 */
export class BaseInstanceRoom extends Room<{ state: InstanceType<typeof InstanceState> }> {
  override onCreate(): void {
    this.state = new InstanceState();
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
