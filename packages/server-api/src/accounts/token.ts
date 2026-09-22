import { SignJWT, jwtVerify } from 'jose';

import { type AccountId, toAccountId } from '@game/shared';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Сессионный JWT (HS256): `sub` — AccountId. Сервер stateless (TECH-SPEC 9.1) —
 * статус аккаунта при проверке токена не держится в памяти, перечитывается из БД.
 */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: Uint8Array) {
    this.key = secret;
  }

  async sign(accountId: AccountId, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<IssuedToken> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(accountId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ttlSeconds)
      .sign(this.key);
    return { token, expiresAt: new Date((issuedAt + ttlSeconds) * 1000) };
  }

  async verify(token: string): Promise<AccountId> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') {
      throw new Error('JWT: отсутствует sub');
    }
    return toAccountId(payload.sub);
  }
}
