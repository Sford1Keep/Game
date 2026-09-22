/**
 * Идентификатор сущности: строка, помеченная именем домена, чтобы `AccountId` и
 * `CharacterId` не подставлялись друг в друга случайно (в отличие от голой `string`).
 * `K` — уникальная метка, создавать значения можно только через `to*Id` на границах.
 */
export type Id<K extends string> = string & { readonly __id: K };

export type AccountId = Id<'Account'>;
export type CharacterId = Id<'Character'>;
export type InstanceId = Id<'Instance'>;

export const toAccountId = (raw: string): AccountId => raw as AccountId;
export const toCharacterId = (raw: string): CharacterId => raw as CharacterId;
export const toInstanceId = (raw: string): InstanceId => raw as InstanceId;
