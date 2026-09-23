import {
  CharacterStatus,
  toAccountId,
  toCharacterId,
  type AccountId,
  type CharacterId,
  type ClassConfig,
} from '@game/shared';
import type { Pool } from 'pg';

import { InvalidInputError } from '../accounts/service.js';

/**
 * Домен `characters` (T-004): создание персонажа на аккаунте и чтение своих.
 * Привязка к инстансу (зона, позиция) вне скоупа задачи — здесь только
 * идентификация: персонаж = имя + класс + принадлежность аккаунту.
 */

export interface CharacterRecord {
  characterId: CharacterId;
  accountId: AccountId;
  name: string;
  classId: string;
  status: CharacterStatus;
}

/** Имя занято на этом аккаунте (уникальность в границах аккаунта). */
export class CharacterNameTakenError extends Error {}

interface CharacterRow {
  id: string;
  account_id: string;
  name: string;
  class_id: string;
  status: string;
}

/** 2–24 символа: буква (любой алфавит) затем буквы/цифры/`_`/`-`. */
const NAME_RE = /^[\p{L}][\p{L}\p{N}_-]{1,23}$/u;

const toRecord = (row: CharacterRow): CharacterRecord => {
  const status = Object.values(CharacterStatus).find((s) => s === row.status);
  if (status === undefined) {
    throw new Error(`БД: неизвестный статус персонажа ${JSON.stringify(row.status)}`);
  }
  return {
    characterId: toCharacterId(row.id),
    accountId: toAccountId(row.account_id),
    name: row.name,
    classId: row.class_id,
    status,
  };
};

export class CharacterService {
  private readonly pool: Pool;
  private readonly classes: Map<string, ClassConfig>;

  constructor(pool: Pool, classes: Map<string, ClassConfig>) {
    this.pool = pool;
    this.classes = classes;
  }

  async create(accountId: AccountId, name: string, classId: string): Promise<CharacterRecord> {
    const nameNorm = name.trim();
    if (!NAME_RE.test(nameNorm)) {
      throw new InvalidInputError('name: 2-24 символа, буква, далее буквы/цифры/_/-');
    }
    if (!this.classes.has(classId)) {
      throw new InvalidInputError(`classId: нет такого класса в /content/classes: ${classId}`);
    }
    try {
      const { rows } = await this.pool.query<CharacterRow>(
        `insert into characters (account_id, name, class_id)
         values ($1, $2, $3)
         returning id, account_id, name, class_id, status`,
        [accountId, nameNorm, classId],
      );
      const row = rows[0];
      if (row === undefined) {
        throw new Error('INSERT без возвращённой строки');
      }
      return toRecord(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new CharacterNameTakenError();
      }
      throw err;
    }
  }

  /** Персонаж аккаунта; чужой id — `undefined` (HTTP-слой отдаёт 404 без раскрытия). */
  async get(accountId: AccountId, characterId: CharacterId): Promise<CharacterRecord | undefined> {
    const { rows } = await this.pool.query<CharacterRow>(
      `select id, account_id, name, class_id, status
       from characters
       where id = $1 and account_id = $2`,
      [characterId, accountId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toRecord(row);
  }

  async listForAccount(accountId: AccountId): Promise<CharacterRecord[]> {
    const { rows } = await this.pool.query<CharacterRow>(
      `select id, account_id, name, class_id, status
       from characters
       where account_id = $1
       order by created_at`,
      [accountId],
    );
    return rows.map(toRecord);
  }
}
