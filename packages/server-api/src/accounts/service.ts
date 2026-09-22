import { type AccountId, AccountStatus, toAccountId } from '@game/shared';
import type { Pool } from 'pg';

import { hashPassword, verifyPassword } from './password.js';
import type { TokenService } from './token.js';

export interface AccountRecord {
  accountId: AccountId;
  login: string;
  status: AccountStatus;
}

export class InvalidInputError extends Error {}
export class LoginAlreadyTakenError extends Error {}
export class InvalidCredentialsError extends Error {}
export class AccountSuspendedError extends Error {}

interface AccountRow {
  id: string;
  login: string;
  password_hash: string;
  status: string;
}

const LOGIN_RE = /^[a-z0-9_]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const toRecord = (row: AccountRow): AccountRecord => {
  const status = Object.values(AccountStatus).find((s) => s === row.status);
  if (status === undefined) {
    throw new Error(`БД: неизвестный статус аккаунта ${JSON.stringify(row.status)}`);
  }
  return { accountId: toAccountId(row.id), login: row.login, status };
};

const normalizeLogin = (login: string): string => login.trim().toLowerCase();

/** Домен `accounts`: регистрация и вход (T-003). Ошибки — типизированы, HTTP-слой только маппит их в коды. */
export class AccountService {
  private readonly pool: Pool;
  private readonly tokens: TokenService;

  constructor(pool: Pool, tokens: TokenService) {
    this.pool = pool;
    this.tokens = tokens;
  }

  async register(login: string, password: string): Promise<AccountRecord> {
    const loginNorm = normalizeLogin(login);
    if (!LOGIN_RE.test(loginNorm)) {
      throw new InvalidInputError('login: 3-32 символа, допустимы a-z, 0-9, _');
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      throw new InvalidInputError(`password: от ${PASSWORD_MIN} до ${PASSWORD_MAX} символов`);
    }

    const passwordHash = await hashPassword(password);
    try {
      const { rows } = await this.pool.query<AccountRow>(
        `insert into accounts (login, password_hash)
         values ($1, $2)
         returning id, login, password_hash, status`,
        [loginNorm, passwordHash],
      );
      const row = rows[0];
      if (row === undefined) {
        throw new Error('INSERT без возвращённой строки');
      }
      return toRecord(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new LoginAlreadyTakenError();
      }
      throw err;
    }
  }

  /** Возвращает токен; не различает «нет такого логина» и «неверный пароль» в тексте ошибки. */
  async authenticate(
    login: string,
    password: string,
  ): Promise<{ account: AccountRecord; token: string; expiresAt: Date }> {
    const loginNorm = normalizeLogin(login);
    const { rows } = await this.pool.query<AccountRow>(
      `select id, login, password_hash, status from accounts where login = $1`,
      [loginNorm],
    );
    const row = rows[0];
    if (row === undefined || !(await verifyPassword(password, row.password_hash))) {
      throw new InvalidCredentialsError();
    }

    const account = toRecord(row);
    if (account.status === AccountStatus.Suspended) {
      throw new AccountSuspendedError();
    }

    const { token, expiresAt } = await this.tokens.sign(account.accountId);
    return { account, token, expiresAt };
  }

  /** Проверка токена → аккаунт (статус перечитывается из БД — токены не отзываются-memory). */
  async resolveSession(token: string): Promise<AccountRecord> {
    const accountId = await this.tokens.verify(token);
    const { rows } = await this.pool.query<AccountRow>(
      `select id, login, password_hash, status from accounts where id = $1`,
      [accountId],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new InvalidCredentialsError();
    }
    return toRecord(row);
  }
}
