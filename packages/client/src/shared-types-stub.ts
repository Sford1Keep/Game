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
 * Проверочный импорт-стаб T-002 со стороны клиента (критерий приёмки). Типы
 * используются в сигнатурах чистого TS-слоя, без обращения к Phaser/DOM.
 */
export interface StubLocalPlayer {
  accountId: AccountId;
  characterId: CharacterId;
  instanceId: InstanceId;
  position: Vector2;
  accountStatus: AccountStatus;
  characterStatus: CharacterStatus;
  /** Проверка обобщённого `Id` с произвольной меткой домена. */
  clientId: Id<'ClientConnection'>;
}

export const buildStubLocalPlayer = (
  raw: { accountId: string; characterId: string; instanceId: string; clientId: string },
  position: Vector2,
): StubLocalPlayer => ({
  accountId: toAccountId(raw.accountId),
  characterId: toCharacterId(raw.characterId),
  instanceId: toInstanceId(raw.instanceId),
  position,
  accountStatus: AccountStatus.Active,
  characterStatus: CharacterStatus.Active,
  clientId: raw.clientId as Id<'ClientConnection'>,
});
