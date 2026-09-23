import { type Client, Room } from 'colyseus';

import { createLogger, type GameLogger, type LogLevel } from '@game/shared';

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
  /** Уровень логгера комнаты; `define(...)` выставляет его из конфига процесса. */
  static logLevel: LogLevel | undefined = undefined;

  private log!: GameLogger;

  override onCreate(): void {
    this.state = new InstanceState();
    this.log = createLogger(
      { module: 'server-instance', instanceId: this.roomId },
      BaseInstanceRoom.logLevel === undefined ? {} : { level: BaseInstanceRoom.logLevel },
    );

    this.onMessage('intent.move', (client, raw: unknown) => {
      const intent = parseMoveIntent(raw);
      const player = this.state.players.get(client.sessionId);
      if (intent === undefined || player === undefined) {
        this.log.warn({ sessionId: client.sessionId }, 'отклонён intent.move');
        return;
      }
      player.x += intent.dx;
      player.y += intent.dy;
    });

    this.log.info('комната создана');
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.x = SPAWN_POINT.x;
    player.y = SPAWN_POINT.y;
    this.state.players.set(client.sessionId, player);
    this.log.info({ sessionId: client.sessionId, players: this.state.players.size }, 'join');
  }

  override onLeave(client: Client): void {
    // allowReconnect не подключаем: auth/reconnect вне скоупа Фазы 0 (TECH-SPEC 11).
    this.state.players.delete(client.sessionId);
    this.log.info({ sessionId: client.sessionId, players: this.state.players.size }, 'leave');
  }

  override onDispose(): void {
    this.log.info('комната уничтожена');
  }
}
