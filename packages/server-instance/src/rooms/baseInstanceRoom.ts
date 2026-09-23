import { type Client, Room } from 'colyseus';

import {
  createLogger,
  toRoomEntityId,
  type AbilityConfig,
  type ClassConfig,
  type DodgeConfig,
  type GameLogger,
  type LogLevel,
  type MobConfig,
} from '@game/shared';

import { loadAbilityCatalog } from '../abilityCatalog.js';
import { loadClassCatalog } from '../classCatalog.js';
import { loadMechanicCatalog } from '../dodgeCatalog.js';
import { loadMobCatalog } from '../mobCatalog.js';
import { stepMob, type MobRuntime } from '../mobAi.js';
import {
  parseAbilityIntent,
  parseDodgeIntent,
  parseMoveIntent,
  type DodgeIntent,
} from '../messages.js';
import {
  AbilityCooldownState,
  InstanceState,
  MobState,
  PlayerState,
  SPAWN_POINT,
} from '../state.js';

/** Служебный ключ кулдауна уклонения в `PlayerState.cooldowns` (не abilityId из конфига). */
export const DODGE_COOLDOWN_KEY = 'dodge';

/**
 * Частота тика AI мобов (T-015) — инженерная константа дискретизации, не баланс:
 * числа самого боя (`attackRange`, `attackIntervalMs`, радиусы агро) с T-020
 * читаются из `/content/mobs`.
 */
export const MOB_TICK_MS = 100;
/**
 * Класс-заглушка для стартовых HP игрока (T-020): id из `content/classes` —
 * ссылка на конфиг по id, не числа. С T-004 персонаж с `ClassId` в БД есть, но
 * комната знает только `sessionId` вошедшего: персонажа в инстанс не переносим.
 */
export const PLAYER_CLASS_ID = 'melee-initiate';
/**
 * Спавны комнаты на старте (T-015): фиксированный набор, без карт/зон —
 * их некому расставлять до конфига территории.
 */
export const MOB_SPAWNS: readonly { mobId: string; x: number; y: number }[] = [
  { mobId: 'rust-scout', x: 8, y: 0 },
];

type PlayerInstanceState = InstanceType<typeof PlayerState>;

/** Конфиг уклонения обязан быть в `/content/mechanics` — без него комната не собирается (T-020). */
const requireDodge = (catalog: Map<string, DodgeConfig>): DodgeConfig => {
  const dodge = catalog.get(DODGE_COOLDOWN_KEY);
  if (dodge === undefined) {
    throw new Error(`нет конфига механики: ${DODGE_COOLDOWN_KEY}`);
  }
  return dodge;
};

/** Класс-заглушка игрока обязан быть в `/content/classes` (T-020). */
const requireClass = (catalog: Map<string, ClassConfig>, id: string): ClassConfig => {
  const config = catalog.get(id);
  if (config === undefined) {
    throw new Error(`нет конфига класса: ${id}`);
  }
  return config;
};

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

  /**
   * Часы комнаты, мс — зависимость, по умолчанию реальные (тот же приём, что
   * `MovementDeps.now` на клиенте): тесту нужно передвигать время дискретно,
   * чтобы проверить истечение статусов (T-016) без реальных таймеров.
   * Прокидывается через класс, как `logLevel`, потому что комнату создаёт
   * матчмейкер: `options` в `define` для этого потянули бы тестовый шов
   * в конфигурацию процесса.
   */
  static now: () => number = () => Date.now();

  private log!: GameLogger;
  private abilities!: Map<string, AbilityConfig>;
  private mobConfigs!: Map<string, MobConfig>;
  private dodge!: DodgeConfig;
  private playerClass!: ClassConfig;
  /** Служебное состояние AI по entityId спавна; состав совпадает с `state.mobs`. */
  private mobRuntimes = new Map<string, MobRuntime>();

  override onCreate(): void {
    this.state = new InstanceState();
    this.abilities = loadAbilityCatalog();
    this.mobConfigs = loadMobCatalog();
    this.dodge = requireDodge(loadMechanicCatalog());
    this.playerClass = requireClass(loadClassCatalog(), PLAYER_CLASS_ID);
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
      if (!this.startCooldown(player, DODGE_COOLDOWN_KEY, this.dodge.cooldownMs)) {
        this.log.info(
          { sessionId: client.sessionId },
          'уклонение не готово, intent.dodge отклонён',
        );
        return;
      }
      this.applyDodge(player, intent);
    });

    for (const spawn of MOB_SPAWNS) {
      this.spawnMob(spawn);
    }
    // Тик AI (T-015): clock комнаты останавливается вместе с dispose комнаты.
    this.clock.setInterval(() => {
      this.tickMobs(BaseInstanceRoom.now());
    }, MOB_TICK_MS);

    this.log.info('комната создана');
  }

  override onJoin(client: Client): void {
    const player = new PlayerState();
    player.x = SPAWN_POINT.x;
    player.y = SPAWN_POINT.y;
    player.hp = this.playerClass.maxHp;
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
    const now = BaseInstanceRoom.now();
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

  /** Рывок на длину из конфига механики по нормализованному направлению (TECH-SPEC 4, T-020). */
  private applyDodge(player: PlayerInstanceState, intent: DodgeIntent): void {
    const length = Math.hypot(intent.dirX, intent.dirY);
    player.x += (intent.dirX / length) * this.dodge.distance;
    player.y += (intent.dirY / length) * this.dodge.distance;
  }

  /** Заводит спавн моба по конфигу из `/content/mobs` (T-015); unknown id падает на старте комнаты. */
  private spawnMob(spawn: { mobId: string; x: number; y: number }): void {
    const config = this.mobConfigs.get(spawn.mobId);
    if (config === undefined) {
      throw new Error(`нет конфига моба для спавна: ${spawn.mobId}`);
    }
    const index = this.mobRuntimes.size + 1;
    // RoomEntityId: один MobId-конфиг спавнится несколько раз (combat.ts, T-012)
    const entityId = toRoomEntityId(`${config.id}#${index}`);
    const mob = new MobState();
    mob.entityId = entityId;
    mob.mobId = config.id;
    mob.x = spawn.x;
    mob.y = spawn.y;
    mob.hp = config.hp;
    this.state.mobs.set(entityId, mob);
    this.mobRuntimes.set(entityId, { readyToAttackAtMs: 0 });
  }

  /** Один тик AI всех спавнов; `dt` фиксирован по частоте clock — детерминизм для тестов (T-015). */
  private tickMobs(nowMs: number): void {
    const players = new Map(this.state.players);
    for (const [entityId, mob] of this.state.mobs) {
      const config = this.mobConfigs.get(mob.mobId);
      const runtime = this.mobRuntimes.get(entityId);
      if (config === undefined || runtime === undefined) {
        continue; // спавн удалён между итерациями — T-016 добавит снятие
      }
      stepMob(mob, config, players, runtime, nowMs, MOB_TICK_MS);
    }
  }
}
