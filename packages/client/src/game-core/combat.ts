import type { Vector2 } from '@game/shared';

/**
 * game-core: ввод атаки/уклонения с локальным кулдауном (T-017, TECH-SPEC 4).
 * Чистый TS — ни Phaser, ни Colyseus: часы и отправка намерений инжектируются
 * (тот же порядок, что у `MovementController` из T-008).
 *
 * Кулдаун: сервер держит авторитетный `readyAtMs` в state (T-014), клиент —
 * его копию для мгновенного фидбека: нажатие либо блокируется локально (без
 * round-trip), либо сразу отправляет интент и optimistic-но запускает местный
 * таймер. Авторитетное значение из state применяется как продление: сервер
 * мог отклонить интент (неизвестный id, гонка состояний), но разогнать
 * локальный кулдаун раньше конфига он не может — поэтому берётся max.
 */

/** Шкала часов — `Date.now()`, та же, что у серверного `readyAtMs` (T-014). */
export interface CombatDeps {
  /** Отправка `intent.ability` (адаптер вызывает room.send). */
  sendAbility(abilityId: string): void;
  /** Отправка `intent.dodge`; длину сервер нормализует сам (TECH-SPEC 4). */
  sendDodge(dir: Vector2): void;
  now(): number;
}

/** Одна доступная действию кнопка: ключ — abilityId, либо `DODGE_KEY`. */
export interface CombatAction {
  readonly key: string;
  readonly cooldownMs: number;
}

/** Ключ кулдауна уклонения в state комнаты — зеркало `DODGE_COOLDOWN_KEY` сервера (T-014). */
export const DODGE_KEY = 'dodge';

export interface ServerCooldown {
  readonly key: string;
  readonly readyAtMs: number;
}

export class CombatController {
  private readonly cooldownMs = new Map<string, number>();
  private readonly readyAt = new Map<string, number>();

  constructor(
    actions: readonly CombatAction[],
    private readonly deps: CombatDeps,
  ) {
    for (const action of actions) {
      this.cooldownMs.set(action.key, action.cooldownMs);
    }
  }

  /** Готово ли действие — читается рендером/HUD (T-018) для локального фидбека. */
  isReady(key: string): boolean {
    const cooldown = this.cooldownMs.get(key);
    if (cooldown === undefined) {
      return false; // действия нет в конфиге — кнопка мертва
    }
    return (this.readyAt.get(key) ?? 0) <= this.deps.now();
  }

  /** Метка готовности, мс (0 — не использовалось). */
  readyAtMs(key: string): number {
    return this.readyAt.get(key) ?? 0;
  }

  /** `true` — интент отправлен; `false` — неизвестная способность или локальный кулдаун. */
  pressAbility(abilityId: string): boolean {
    if (!this.tryStart(abilityId)) {
      return false;
    }
    this.deps.sendAbility(abilityId);
    return true;
  }

  /**
   * Рывок в направлении `dir` (обычно текущий/последний вектор ввода).
   * Нулевой вектор — `false` без расхода кулдауна: сервер такой интент
   * отклонил бы (`parseDodgeIntent`), наказывать кнопку за отсутствие
   * направления нельзя.
   */
  pressDodge(dir: Vector2): boolean {
    if (dir.x === 0 && dir.y === 0) {
      return false;
    }
    if (!this.tryStart(DODGE_KEY)) {
      return false;
    }
    this.deps.sendDodge(dir);
    return true;
  }

  /** Копия авторитетных кулдаунов локального игрока из state комнаты. */
  applyServerCooldowns(entries: readonly ServerCooldown[]): void {
    for (const { key, readyAtMs } of entries) {
      if (readyAtMs > (this.readyAt.get(key) ?? 0)) {
        this.readyAt.set(key, readyAtMs);
      }
    }
  }

  private tryStart(key: string): boolean {
    const cooldown = this.cooldownMs.get(key);
    if (cooldown === undefined) {
      return false;
    }
    const now = this.deps.now();
    if ((this.readyAt.get(key) ?? 0) > now) {
      return false;
    }
    this.readyAt.set(key, now + cooldown);
    return true;
  }
}
