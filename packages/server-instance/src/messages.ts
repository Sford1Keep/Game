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

/** `intent.ability`: активация способности; `abilityId` сверяется с каталогом `/content` в комнате (T-014). */
export interface AbilityIntent {
  abilityId: string;
}

/** Возвращает валидный `intent.ability` или undefined — payload без непустой строки `abilityId`. */
export const parseAbilityIntent = (raw: unknown): AbilityIntent | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { abilityId } = raw as Record<string, unknown>;
  if (typeof abilityId !== 'string' || abilityId.length === 0) {
    return undefined;
  }
  return { abilityId };
};

/**
 * `intent.dodge`: рывок в направлении `(dirX, dirY)`. Вектор — только направление:
 * длину сервер нормализует и подставляет свою константу (TECH-SPEC 4 — позиции
 * авторитетны, клиенту длину не доверяем).
 */
export interface DodgeIntent {
  dirX: number;
  dirY: number;
}

/** Возвращает валидный `intent.dodge` или undefined — на мусоре/NaN/нулевом векторе. */
export const parseDodgeIntent = (raw: unknown): DodgeIntent | undefined => {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const { dirX, dirY } = raw as Record<string, unknown>;
  if (typeof dirX !== 'number' || typeof dirY !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(dirX) || !Number.isFinite(dirY)) {
    return undefined;
  }
  if (dirX === 0 && dirY === 0) {
    return undefined; // нулевой вектор не нормализуем
  }
  return { dirX, dirY };
};
