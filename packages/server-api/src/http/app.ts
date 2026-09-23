import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

import { type GameLogger } from '@game/shared';

import {
  AccountSuspendedError,
  type AccountService,
  InvalidCredentialsError,
  InvalidInputError,
  LoginAlreadyTakenError,
} from '../accounts/service.js';

/**
 * `requestId` живёт на запросе с первой middleware и попадает во все записи
 * логгера этого запроса (TECH-SPEC 10.1). `accountId` добавится сюда же, когда
 * появится auth-middleware — сейчас аутентифицированных эндпоинтов нет.
 */
declare module 'express-serve-static-core' {
  interface Request {
    log: GameLogger;
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

export const createApp = (accounts: AccountService, log: GameLogger): express.Express => {
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
