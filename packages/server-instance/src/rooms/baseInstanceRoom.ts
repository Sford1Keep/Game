import { type Client, Room } from 'colyseus';

import { createLogger, type AbilityConfig, type GameLogger, type LogLevel } from '@game/shared';

import { loadAbilityCatalog } from '../abilityCatalog.js';
import {
  parseAbilityIntent,
  parseDodgeIntent,
  parseMoveIntent,
  type DodgeIntent,
} from '../messages.js';
import { AbilityCooldownState, InstanceState, PlayerState, SPAWN_POINT } from '../state.js';

/**
 * Числа уклонения — серверные константы (решение T-013, PROJECT-MAP `/content`):
 * уклонение не является `AbilityConfig`-способностью и в `/content` не лежит.
 */
export const DODGE_COOLDOWN_MS = 2_000;
export const DODGE_DISTANCE = 3;
/** Служебный ключ кулдауна уклонения в `PlayerState.cooldowns` (не abilityId из конфига). */
export const DODGE_COOLDOWN_KEY = 'dodge';

type PlayerInstanceState = InstanceType<typeof PlayerState>;

/**
 * Комната инстанса: жизненный цикл Colyseus, репликация позиции игрока в state
 * (T-005) и авторитетное применение намерений (TECH-SPEC 1, 4): `intent.move`
 * применяет смещение (T-006); с T-014 — `intent.ability` и `intent.dodge`,
 * где сервер проверяет существование способности (каталог `/content`) и
 * кулдаун: до истечения кулдауна намерение отклоняется без побочных эффектов.
 * Сам расчёт урона по способности — T-016, здесь только проверка и учёт кулдауна.
 */
export class BaseInstanceRoom extends Room<{ state: InstanceType<typeof InstanceState> }> {
  /** Уровень логгера комнаты; `define(...)` выставляет его из конфига процесса. */
  static logLevel: LogLevel | undefined = undefined;

  private log!: GameLogger;
  private abilities!: Map<string, AbilityConfig>;

  override onCreate(): void {
    this.state = new InstanceState();
    this.abilities = loadAbilityCatalog();
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

    this.onMessage('intent.ability', (client, raw: unknown) => {
      const intent = parseAbilityIntent(raw);
      const player = this.state.players.get(client.sessionId);
      if (intent === undefined || player === undefined) {
        this.log.warn({ sessionId: client.sessionId }, 'отклонён intent.ability');
        return;
      }
      const ability = this.abilities.get(intent.abilityId);
      if (ability === undefined) {
        this.log.warn(
          { sessionId: client.sessionId, abilityId: intent.abilityId },
          'неизвестная способность, intent.ability отклонён',
        );
        return;
      }
      if (!this.startCooldown(player, ability.id, ability.cooldownMs)) {
        this.log.info(
          { sessionId: client.sessionId, abilityId: ability.id },
          'способность не готова, intent.ability отклонён',
        );
      }
    });

    this.onMessage('intent.dodge', (client, raw: unknown) => {
      const intent = parseDodgeIntent(raw);
      const player = this.state.players.get(client.sessionId);
      if (intent === undefined || player === undefined) {
        this.log.warn({ sessionId: client.sessionId }, 'отклонён intent.dodge');
        return;
      }
      if (!this.startCooldown(player, DODGE_COOLDOWN_KEY, DODGE_COOLDOWN_MS)) {
        this.log.info(
          { sessionId: client.sessionId },
          'уклонение не готово, intent.dodge отклонён',
        );
        return;
      }
      this.applyDodge(player, intent);
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

  /**
   * Единая проверка и запуск кулдауна (T-014): `true` — намерение принято,
   * кулдаун перезапущен; `false` — ещё не готов, побочных эффектов нет.
   */
  private startCooldown(player: PlayerInstanceState, key: string, cooldownMs: number): boolean {
    const now = Date.now();
    const existing = player.cooldowns.get(key);
    if (existing !== undefined && existing.readyAtMs > now) {
      return false;
    }
    const cooldown = new AbilityCooldownState();
    cooldown.abilityId = key;
    cooldown.readyAtMs = now + cooldownMs;
    player.cooldowns.set(key, cooldown);
    return true;
  }

  /** Рывок на фиксированную длину по нормализованному направлению (TECH-SPEC 4). */
  private applyDodge(player: PlayerInstanceState, intent: DodgeIntent): void {
    const length = Math.hypot(intent.dirX, intent.dirY);
    player.x += (intent.dirX / length) * DODGE_DISTANCE;
    player.y += (intent.dirY / length) * DODGE_DISTANCE;
  }
}
