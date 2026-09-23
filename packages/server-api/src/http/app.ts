import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

import { type AccountId, type GameLogger, AccountStatus, toCharacterId } from '@game/shared';

import {
  AccountSuspendedError,
  type AccountService,
  InvalidCredentialsError,
  InvalidInputError,
  LoginAlreadyTakenError,
} from '../accounts/service.js';
import { CharacterNameTakenError, type CharacterService } from '../characters/service.js';

/**
 * `requestId` живёт на запросе с первой middleware и попадает во все записи
 * логгера этого запроса (TECH-SPEC 10.1). На аутентифицированных маршрутах
 * (T-004) `req.log` дополнительно содержит `accountId`.
 */
declare module 'express-serve-static-core' {
  interface Request {
    log: GameLogger;
    accountId?: AccountId;
  }
}

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

const wrap =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

interface Credentials {
  login: string;
  password: string;
}

const readCredentials = (body: unknown): Credentials => {
  if (typeof body !== 'object' || body === null) {
    throw new InvalidInputError('тело запроса: JSON-объект');
  }
  const { login, password } = body as Record<string, unknown>;
  if (typeof login !== 'string' || typeof password !== 'string') {
    throw new InvalidInputError('поля login и password — строки');
  }
  return { login, password };
};

interface CharacterInput {
  name: string;
  classId: string;
}

const readCharacterInput = (body: unknown): CharacterInput => {
  if (typeof body !== 'object' || body === null) {
    throw new InvalidInputError('тело запроса: JSON-объект');
  }
  const { name, classId } = body as Record<string, unknown>;
  if (typeof name !== 'string' || typeof classId !== 'string') {
    throw new InvalidInputError('поля name и classId — строки');
  }
  return { name, classId };
};

/** Аккаунт из `req.accountId`, проставленного auth-middleware маршрутов персонажей. */
const requireAccountId = (req: Request): AccountId => {
  if (req.accountId === undefined) {
    throw new Error('auth-middleware не отработал');
  }
  return req.accountId;
};

const characterDto = (c: {
  characterId: string;
  name: string;
  classId: string;
  status: string;
}): Record<string, unknown> => ({
  characterId: c.characterId,
  name: c.name,
  classId: c.classId,
  status: c.status,
});

export const createApp = (
  accounts: AccountService,
  characters: CharacterService,
  log: GameLogger,
): express.Express => {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next): void => {
    const requestId = randomUUID();
    req.log = log.child({ requestId });
    res.setHeader('x-request-id', requestId);
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      req.log.info(
        { method: req.method, url: req.originalUrl, statusCode: res.statusCode, elapsedMs },
        'запрос завершён',
      );
    });
    next();
  });

  app.use(express.json({ limit: '16kb' }));

  app.get(
    '/healthz',
    wrap(async (_req, res) => {
      res.json({ ok: true });
    }),
  );

  app.post(
    '/accounts/register',
    wrap(async (req, res) => {
      const { login, password } = readCredentials(req.body);
      const account = await accounts.register(login, password);
      res.status(201).json({ accountId: account.accountId, login: account.login });
    }),
  );

  app.post(
    '/accounts/login',
    wrap(async (req, res) => {
      const { login, password } = readCredentials(req.body);
      const { account, token, expiresAt } = await accounts.authenticate(login, password);
      res.json({ accountId: account.accountId, token, expiresAt: expiresAt.toISOString() });
    }),
  );

  // Авторизация (T-004): Bearer-токен из /accounts/login → AccountId на запросе.
  // Статус перечитывается из БД (resolveSession), suspending отрезает и существующие сессии.
  app.use('/characters', (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header !== undefined && header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token === '') {
      next(new InvalidCredentialsError());
      return;
    }
    accounts
      .resolveSession(token)
      .then((account) => {
        if (account.status === AccountStatus.Suspended) {
          next(new AccountSuspendedError());
          return;
        }
        req.accountId = account.accountId;
        req.log = req.log.child({ accountId: account.accountId });
        next();
      })
      .catch((err: unknown) => {
        // битая/чужая подпись и просроченный JWT — отказ авторизации, не 500
        next(
          err instanceof InvalidCredentialsError || err instanceof AccountSuspendedError
            ? err
            : new InvalidCredentialsError(),
        );
      });
  });

  app.post(
    '/characters',
    wrap(async (req, res) => {
      const { name, classId } = readCharacterInput(req.body);
      const character = await characters.create(requireAccountId(req), name, classId);
      res.status(201).json({ character: characterDto(character) });
    }),
  );

  app.get(
    '/characters',
    wrap(async (req, res) => {
      const own = await characters.listForAccount(requireAccountId(req));
      res.json({ characters: own.map(characterDto) });
    }),
  );

  app.get(
    '/characters/:id',
    wrap(async (req, res) => {
      const { id } = req.params;
      const character =
        typeof id === 'string'
          ? await characters.get(requireAccountId(req), toCharacterId(id))
          : undefined;
      if (character === undefined) {
        // чужой персонаж неотличим от несуществующего — без раскрытия
        res.status(404).json({ error: 'character_not_found' });
        return;
      }
      res.json({ character: characterDto(character) });
    }),
  );

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof InvalidInputError) {
      req.log.warn({ err, reason: 'invalid_input' }, 'запрос отклонён');
      res.status(400).json({ error: 'invalid_input', details: err.message });
      return;
    }
    if (err instanceof LoginAlreadyTakenError) {
      req.log.warn({ err, reason: 'login_already_taken' }, 'запрос отклонён');
      res.status(409).json({ error: 'login_already_taken' });
      return;
    }
    if (err instanceof InvalidCredentialsError) {
      req.log.warn({ err, reason: 'invalid_credentials' }, 'запрос отклонён');
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    if (err instanceof AccountSuspendedError) {
      req.log.warn({ err, reason: 'account_suspended' }, 'запрос отклонён');
      res.status(403).json({ error: 'account_suspended' });
      return;
    }
    if (err instanceof CharacterNameTakenError) {
      req.log.warn({ err, reason: 'character_name_taken' }, 'запрос отклонён');
      res.status(409).json({ error: 'character_name_taken' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      req.log.warn({ err, reason: 'invalid_json' }, 'запрос отклонён');
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    req.log.error({ err }, 'необработанная ошибка запроса');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
};
