import {
  AccountStatus,
  CharacterStatus,
  toAccountId,
  toCharacterId,
  toInstanceId,
  type AccountId,
  type CharacterId,
  type Id,
  type InstanceId,
  type Vector2,
} from '@game/shared';

/**
 * Проверочный импорт-стаб T-002 (критерий приёмки): доказывает, что типы `shared`
 * разрешаются и применяются из `server-api`. Заменяется реальным использованием
 * в T-003/T-004, отдельной задачи на удаление не требует.
 */
export interface StubAccountRow {
  accountId: AccountId;
  status: AccountStatus;
  /** Проверка обобщённого `Id` с произвольной меткой домена. */
  sessionToken: Id<'Session'>;
}

export interface StubCharacterRow {
  characterId: CharacterId;
  instanceId: InstanceId;
  status: CharacterStatus;
  spawn: Vector2;
}

export const buildStubAccountRow = (rawAccountId: string, rawToken: string): StubAccountRow => ({
  accountId: toAccountId(rawAccountId),
  status: AccountStatus.Active,
  sessionToken: rawToken as Id<'Session'>,
});

export const buildStubCharacterRow = (
  rawCharacterId: string,
  rawInstanceId: string,
  spawn: Vector2,
): StubCharacterRow => ({
  characterId: toCharacterId(rawCharacterId),
  instanceId: toInstanceId(rawInstanceId),
  status: CharacterStatus.Active,
  spawn,
});
