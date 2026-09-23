import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { AccountStatus } from '@game/shared';

import { loadConfig } from '../src/config.js';
import { startServer, type RunningServer } from '../src/index.js';

/**
 * Тестовый стаб T-004: создание персонажа авторизованным аккаунтом и повторное
 * получение его данных; чужой персонаж недоступен. Против реального PostgreSQL.
 */

const JWT_SECRET = 'test-secret-0123456789abcdef-0123456789abcdef';

let running: RunningServer;
let baseUrl: string;

const api = async (
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

/** Регистрация + вход нового аккаунта; возвращает (accountId, token). */
const newAccount = async (login: string): Promise<{ accountId: string; token: string }> => {
  const reg = await api('POST', '/accounts/register', {
    body: { login, password: 'character-test-1234' },
  });
  assert.equal(reg.status, 201);
  const loginRes = await api('POST', '/accounts/login', {
    body: { login, password: 'character-test-1234' },
  });
  assert.equal(loginRes.status, 200);
  return {
    accountId: reg.json.accountId as string,
    token: loginRes.json.token as string,
  };
};

before(async () => {
  const config = loadConfig({
    ...(process.env.DATABASE_URL === undefined ? {} : { DATABASE_URL: process.env.DATABASE_URL }),
    JWT_SECRET,
    PORT: '0',
    LOG_LEVEL: 'silent',
  });
  running = await startServer(config);
  baseUrl = `http://127.0.0.1:${running.port}`;
  await running.pool.query('truncate table characters, accounts');
});

after(async () => {
  await running.pool.query('truncate table characters, accounts');
  running.server.close();
  await running.pool.end();
});

describe('T-004: создание персонажа', () => {
  it('авторизованный аккаунт создаёт персонажа и получает его данные повторным запросом', async () => {
    const { token } = await newAccount('char_owner');

    const created = await api('POST', '/characters', {
      body: { name: 'Ржавый_Кулак', classId: 'melee-initiate' },
      token,
    });
    assert.equal(created.status, 201);
    const character = created.json.character as Record<string, unknown>;
    assert.equal(character.name, 'Ржавый_Кулак');
    assert.equal(character.classId, 'melee-initiate');
    assert.equal(character.status, 'active');
    assert.equal('accountId' in character, false, 'владельцем не раскидываемся в dto');

    const refetch = await api('GET', `/characters/${character.characterId as string}`, { token });
    assert.equal(refetch.status, 200);
    assert.deepEqual(refetch.json.character, character);

    const list = await api('GET', '/characters', { token });
    assert.equal(list.status, 200);
    const names = (list.json.characters as unknown[]).map(
      (c) => (c as Record<string, unknown>).characterId,
    );
    assert.deepEqual(names, [character.characterId]);
  });

  it('чужой персонаж недоступен: 404, неотличим от несуществующего', async () => {
    const owner = await newAccount('char_victim');
    const intruder = await newAccount('char_intruder');

    const created = await api('POST', '/characters', {
      body: { name: 'Секрет', classId: 'melee-initiate' },
      token: owner.token,
    });
    assert.equal(created.status, 201);
    const characterId = (created.json.character as Record<string, unknown>).characterId as string;

    const stolen = await api('GET', `/characters/${characterId}`, { token: intruder.token });
    assert.equal(stolen.status, 404);
    assert.equal(stolen.json.error, 'character_not_found');

    const missing = await api('GET', '/characters/no-such-character', { token: intruder.token });
    assert.deepEqual(stolen.json, missing.json, 'чужой и несуществующий неразличимы');

    const intruderList = await api('GET', '/characters', { token: intruder.token });
    assert.deepEqual(intruderList.json.characters, []);
  });

  it('без токена, с битым и с чужим подписанным токеном — 401', async () => {
    const anonymous = await api('GET', '/characters');
    assert.equal(anonymous.status, 401);

    const garbage = await api('POST', '/characters', {
      body: { name: 'Кто угодно', classId: 'melee-initiate' },
      token: 'not-a-jwt-at-all',
    });
    assert.equal(garbage.status, 401);

    // токен с вымышленным sub и неверной подписью — не проходит верификацию
    const foreign = await api('GET', '/characters', {
      token:
        'eyJhbGciOiJIUzI1NiJ9.' +
        Buffer.from(
          JSON.stringify({ sub: 'no-such-account', iat: 1, exp: 4_000_000_000 }),
        ).toString('base64url') +
        '.x',
    });
    assert.equal(foreign.status, 401);
  });

  it('suspended-аккаунт теряет доступ к персонажам (403), даже с живым токеном', async () => {
    const account = await newAccount('char_suspended');
    await running.pool.query('update accounts set status = $1 where id = $2', [
      AccountStatus.Suspended,
      account.accountId,
    ]);
    const res = await api('GET', '/characters', { token: account.token });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'account_suspended');
  });

  it('валидация: неизвестный класс и плохое имя → 400, повтор имени на аккаунте → 409', async () => {
    const { token } = await newAccount('char_validator');

    const badClass = await api('POST', '/characters', {
      body: { name: 'Нормальное Имя', classId: 'archmage' },
      token,
    });
    assert.equal(badClass.status, 400);
    assert.equal(badClass.json.error, 'invalid_input');

    for (const name of [
      '',
      'А',
      '1девятнадцать_символов_хвост',
      'пробел  внутри!!',
      'Ржавый Кулак',
    ]) {
      const res = await api('POST', '/characters', {
        body: { name, classId: 'melee-initiate' },
        token,
      });
      assert.equal(res.status, 400, `имя ${JSON.stringify(name)} не должно проходить`);
    }

    const first = await api('POST', '/characters', {
      body: { name: 'Дубль', classId: 'melee-initiate' },
      token,
    });
    assert.equal(first.status, 201);
    const second = await api('POST', '/characters', {
      body: { name: '  Дубль  ', classId: 'melee-initiate' },
      token,
    });
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'character_name_taken');
  });

  it('одинаковые имена на разных аккаунтах не конфликтуют', async () => {
    const a = await newAccount('char_twin_a');
    const b = await newAccount('char_twin_b');

    const first = await api('POST', '/characters', {
      body: { name: 'Близнец', classId: 'melee-initiate' },
      token: a.token,
    });
    const second = await api('POST', '/characters', {
      body: { name: 'Близнец', classId: 'melee-initiate' },
      token: b.token,
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(
      (first.json.character as Record<string, unknown>).characterId,
      (second.json.character as Record<string, unknown>).characterId,
    );
  });
});
