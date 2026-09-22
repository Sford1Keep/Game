/**
 * Прикладные сообщения комнаты (TECH-SPEC 4): client→server намерения.
 * Разбор/валидация payload — чистыми функциями, чтобы комната оставалась
 * тонким слоем, а правила валидации переиспользовались в тестах.
 */

/** `intent.move`: смещение позиции игрока, dx/dy по осям зоны. */
export interface MoveIntent {
  dx: number;
  dy: number;
}

/** Возвращает валидный `intent.move` или undefined — на мусоре/NaN/Infinity. */
export const parseMoveIntent = (raw: unknown): MoveIntent | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { dx, dy } = raw as Record<string, unknown>;
  if (typeof dx !== 'number' || typeof dy !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return undefined;
  }
  return { dx, dy };
};
