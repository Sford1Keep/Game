import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';

import { createLogger, parseLogLevel, resolveLogLevel } from '../src/index.js';

/**
 * Тестовый стаб T-010: `createLogger` из `@game/shared` (TECH-SPEC 10.1).
 * Записи читаются из перехваченного потока — stdout в тесте не трогаем.
 */

const capture = (): { records: () => Record<string, unknown>[]; stream: NodeJS.WritableStream } => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      chunks.push(chunk.toString('utf8'));
      callback();
    },
  });
  return {
    records: () =>
      chunks
        .flatMap((raw) => raw.split('\n'))
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    stream,
  };
};

test('LOG_LEVEL задаёт уровень, неизвестное значение отклоняется', () => {
  assert.equal(resolveLogLevel({ LOG_LEVEL: 'warn' }), 'warn');
  assert.equal(parseLogLevel('trace'), 'trace');
  assert.throws(() => parseLogLevel('verbose'), /неизвестный уровень/);
});

test('уровень по умолчанию: info в проде, debug в dev', () => {
  assert.equal(resolveLogLevel({ NODE_ENV: 'production' }), 'info');
  assert.equal(resolveLogLevel({}), 'debug');
  assert.equal(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: 'error' }), 'error');
});

test('контекст фабрики попадает в каждую запись', async () => {
  const out = capture();
  const log = createLogger({ module: 'server-api' }, { level: 'info', destination: out.stream });
  log.info('готов');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const [record] = out.records();
  assert.equal(record?.msg, 'готов');
  assert.equal(record?.module, 'server-api');
});

test('брошенная ошибка логируется со стеком и корреляционным id', async () => {
  const out = capture();
  const log = createLogger({ module: 'server-api' }, { level: 'info', destination: out.stream });
  const requestLog = log.child({ requestId: 'req-1' });
  try {
    throw new Error('положился бэкенд');
  } catch (err) {
    requestLog.error({ err }, 'необработанная ошибка запроса');
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  const [record] = out.records();
  assert.equal(record?.requestId, 'req-1');
  const error = record?.err as { type: string; message: string; stack: string };
  assert.equal(error.message, 'положился бэкенд');
  assert.match(error.stack, /Error: положился бэкенд/);
});
