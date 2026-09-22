import express, { type NextFunction, type Request, type Response } from 'express';

import {
  AccountSuspendedError,
  type AccountService,
  InvalidCredentialsError,
  InvalidInputError,
  LoginAlreadyTakenError,
} from '../accounts/service.js';

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

export const createApp = (accounts: AccountService): express.Express => {
  const app = express();
  app.disable('x-powered-by');
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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof InvalidInputError) {
      res.status(400).json({ error: 'invalid_input', details: err.message });
      return;
    }
    if (err instanceof LoginAlreadyTakenError) {
      res.status(409).json({ error: 'login_already_taken' });
      return;
    }
    if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    if (err instanceof AccountSuspendedError) {
      res.status(403).json({ error: 'account_suspended' });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    console.error('server-api: необработанная ошибка запроса', err);
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
};
