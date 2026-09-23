import type { Vector2 } from '@game/shared';

/**
 * game-core: ввод атаки/уклонения с локальным кулдауном (T-017, TECH-SPEC 4).
 * Чистый TS — ни Phaser, ни Colyseus: часы и отправка намерений инжектируются
 * (тот же порядок, что у `MovementController` из T-008).
 *
 * Кулдаун считается только локально и только от момента нажатия: `readyAtMs`
 * сервера (T-014) — абсолютная метка другой машины, а общей временной базы у
 * часов клиента и сервера нет. Сравнение с ней блокировало бы кнопку дольше
 * серверного кулдауна (или отпускало бы раньше), если часы клиента отстают.
 * Авторитет при этом не меняется: лишний интент сервер отклоняет сам.
 * Возврат синхронизации — отдельное решение, когда под это появится HUD.
 */

/**
 * Зависимости контроллера: канал отправки интентов и локальные часы. Шкала
 * часов — часы клиента, абсолютные серверные `readyAtMs` в неё не подмешиваются.
 */
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
