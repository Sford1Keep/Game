import type { Vector2 } from '@game/shared';

/**
 * game-core: локальное предсказание движения с реконсиляцией (TECH-SPEC 4).
 * Чистый TS — ни Phaser, ни Colyseus: отправка намерений и часы инжектируются.
 *
 * Модель: сервер применяет сумму присланных смещений, поэтому
 * `authoritative + inFlight + unsent` — это то, где локальный игрок «честно»
 * должен быть. Расхождение сверх допуска (сервер отбросил дельту, изменил
 * позицию сам) — предсказание жёстко переставляется на честную оценку.
 */

export interface MovementDeps {
  /** Отправка намерения на сервер (адаптер вызывает room.send('intent.move', ...)). */
  sendMove(dx: number, dy: number): void;
  /** Часы в мс — инжектируются для детерминированных тестов. */
  now(): number;
}

const add = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vector2, b: Vector2): Vector2 => ({ x: a.x - b.x, y: a.y - b.y });
const isZero = (v: Vector2): boolean => v.x === 0 && v.y === 0;

/** Скорость локального игрока, мировых единиц/сек. Числа баланса — не здесь, см. /content (T-009). */
export const LOCAL_SPEED = 4;
/** Период отправки намерений, мс (20 Гц, TECH-SPEC 4). */
export const SEND_INTERVAL_MS = 50;
/** Допуск расхождения предсказания с честной оценкой, в мировых единицах. */
export const SNAP_TOLERANCE = 0.5;

export class MovementController {
  /** Предсказанная позиция — её рисует рендер, она же источник намерений. */
  position: Vector2;

  private direction: Vector2 = { x: 0, y: 0 };
  private authoritative: Vector2;
  /** Отправлено и ещё не подтверждено state'ом. */
  private inFlight: Vector2 = { x: 0, y: 0 };
  /** Накоплено локально и ещё не отправлено. */
  private unsent: Vector2 = { x: 0, y: 0 };
  private lastSendAt: number;

  constructor(
    spawn: Vector2,
    private readonly deps: MovementDeps,
  ) {
    this.position = { ...spawn };
    this.authoritative = { ...spawn };
    this.lastSendAt = deps.now();
  }

  /** Направление ввода (нормализовывать не обязательно — скорость нормируется здесь). */
  setDirection(dir: Vector2): void {
    const len = Math.hypot(dir.x, dir.y);
    if (len === 0) {
      this.direction = { x: 0, y: 0 };
      return;
    }
    this.direction = { x: dir.x / len, y: dir.y / len };
  }

  /** Шаг симуляции предсказания; dtMs — кадрный дельта-тайм. */
  update(dtMs: number): void {
    if (this.direction.x === 0 && this.direction.y === 0) {
      return;
    }
    const step = {
      x: this.direction.x * LOCAL_SPEED * (dtMs / 1000),
      y: this.direction.y * LOCAL_SPEED * (dtMs / 1000),
    };
    this.position = add(this.position, step);
    this.unsent = add(this.unsent, step);
    this.flushIfDue();
  }

  /**
   * Авторитетная позиция локального игрока из state комнаты. Сдвиг authoritative
   * «съедает» inFlight; всё, что не сходится в пределах допуска, — решит сервер.
   */
  onAuthoritative(pos: Vector2): void {
    const applied = sub(pos, this.authoritative);
    this.authoritative = { ...pos };
    // inFlight только «съедается» подтверждением; обратный сдвиг сервера
    // (телепорт назад) не должен искусственно наращивать незакрытый путь.
    const consume = (pending: number, delta: number): number =>
      Math.max(0, pending - Math.max(0, delta));
    this.inFlight = {
      x: consume(this.inFlight.x, applied.x),
      y: consume(this.inFlight.y, applied.y),
    };

    const fair = add(this.authoritative, add(this.inFlight, this.unsent));
    const error = sub(this.position, fair);
    if (Math.hypot(error.x, error.y) > SNAP_TOLERANCE) {
      this.position = fair;
    }
  }

  /** Принудительная отправка накопленного (на отпускание клавиш, чтобы не терять шаг). */
  flush(): void {
    this.lastSendAt = this.deps.now();
    this.dispatch();
  }

  private flushIfDue(): void {
    const now = this.deps.now();
    if (now - this.lastSendAt < SEND_INTERVAL_MS) {
      return;
    }
    // Сдвигаем расписание на интервал, а не на `now`: иначе квантование кадров
    // по 16 мс растягивает 50-мс интервал до 64 мс (15.6 Гц вместо 20 Гц).
    // Сильное отставание (пробуждение из фонового таба) — сброс на `now`.
    this.lastSendAt =
      now - this.lastSendAt > SEND_INTERVAL_MS * 3 ? now : this.lastSendAt + SEND_INTERVAL_MS;
    this.dispatch();
  }

  private dispatch(): void {
    if (isZero(this.unsent)) {
      return;
    }
    this.deps.sendMove(this.unsent.x, this.unsent.y);
    this.inFlight = add(this.inFlight, this.unsent);
    this.unsent = { x: 0, y: 0 };
  }
}
