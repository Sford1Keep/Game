import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// Параметры подобраны под лимит maxmem Node по умолчанию (32 MiB): 128 * N * r ≈ 16 MiB.
const LOG_N = 14;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const normalize = (password: string): string => password.normalize('NFKC');

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(normalize(password), salt, KEY_BYTES, {
    N: 2 ** LOG_N,
    r: R,
    p: P,
  });
  return ['scrypt', LOG_N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
};

/** Формат: scrypt$LOG_N$r$p$salt(b64)$key(b64). Возвращает false для любых невалидных/чужих хешей. */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const logN = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (
    !Number.isInteger(logN) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    salt.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }

  try {
    const actual = (await scryptAsync(normalize(password), salt, expected.length, {
      N: 2 ** logN,
      r,
      p,
    })) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};
