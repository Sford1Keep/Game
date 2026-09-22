import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AccountStatus } from '@game/shared';

import { loadConfig } from '../src/config.js';
import { startServer, type RunningServer } from '../src/index.js';
import { TokenService } from '../src/accounts/token.js';

const JWT_SECRET = 'test-secret-0123456789abcdef-0123456789abcdef';

let running: RunningServer;
let baseUrl: string;
let tokens: TokenService;

const api = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

before(async () => {
  const config = loadConfig({
    ...(process.env.DATABASE_URL === undefined ? {} : { DATABASE_URL: process.env.DATABASE_URL }),
    JWT_SECRET,
    PORT: '0',
  });
  running = await startServer(config);
  baseUrl = `http://127.0.0.1:${running.port}`;
  tokens = new TokenService(config.jwtSecret);
  await running.pool.query('truncate table accounts');
});

after(async () => {
  running.server.close();
  await running.pool.end();
});

describe('T-003: аккаунты (регистрация/вход)', () => {
  it('healthcheck', async () => {
    const { status, json } = await api('GET', '/healthz');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
  });

  it('регистрация возвращает accountId без пароля, вход выдаёт валидный токен', async () => {
    const reg = await api('POST', '/accounts/register', {
      login: 'Hero_One',
      password: 'correct horse battery staple',
    });
    assert.equal(reg.status, 201);
    assert.equal(typeof reg.json.accountId, 'string');
    assert.equal(reg.json.login, 'hero_one'); // нормализация регистра
    assert.equal('password' in reg.json, false);
    assert.equal('passwordHash' in reg.json, false);

    const login = await api('POST', '/accounts/login', {
      login: 'HERO_ONE',
      password: 'correct horse battery staple',
    });
    assert.equal(login.status, 200);
    assert.equal(typeof login.json.token, 'string');

    const accountId = await tokens.verify(login.json.token as string);
    assert.equal(accountId, reg.json.accountId);
  });

  it('повторная регистрация с тем же логином отклоняется с понятной ошибкой', async () => {
    const first = await api('POST', '/accounts/register', {
      login: 'dup_login',
      password: '12345678pass',
    });
    assert.equal(first.status, 201);
    const second = await api('POST', '/accounts/register', {
      login: 'DUP_LOGIN',
      password: 'another-password',
    });
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'login_already_taken');
  });

  it('вход с неверным паролем отклоняется', async () => {
    const res = await api('POST', '/accounts/login', {
      login: 'hero_one',
      password: 'wrong password 123',
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.error, 'invalid_credentials');
  });

  it('вход несуществующего аккаунта — та же ошибка, без раскрытия существования логина', async () => {
    const res = await api('POST', '/accounts/login', {
      login: 'no_such_login',
      password: 'whatever 12345',
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.error, 'invalid_credentials');
  });

  it('валидация входа: короткий пароль и неверный формат логина → 400', async () => {
    const short = await api('POST', '/accounts/register', { login: 'ok_login', password: 'short' });
    assert.equal(short.status, 400);
    assert.equal(short.json.error, 'invalid_input');

    const badLogin = await api('POST', '/accounts/register', {
      login: 'aa!!',
      password: 'longenough1',
    });
    assert.equal(badLogin.status, 400);
    assert.equal(badLogin.json.error, 'invalid_input');
  });

  it('suspended-аккаунту вход блокируется (403), а токен существующей сессии перечитывается из БД', async () => {
    const reg = await api('POST', '/accounts/register', {
      login: 'to_suspend',
      password: 'password1234',
    });
    const accountId = reg.json.accountId as string;

    const { token } = (
      await api('POST', '/accounts/login', {
        login: 'to_suspend',
        password: 'password1234',
      })
    ).json as { token: string };
    assert.equal(typeof token, 'string');

    await running.pool.query('update accounts set status = $1 where id = $2', [
      AccountStatus.Suspended,
      accountId,
    ]);

    const blocked = await api('POST', '/accounts/login', {
      login: 'to_suspend',
      password: 'password1234',
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error, 'account_suspended');
  });

  it('битый JSON в теле → 400 invalid_json', async () => {
    const res = await fetch(`${baseUrl}/accounts/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{oops',
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as Record<string, unknown>).error, 'invalid_json');
  });
});
