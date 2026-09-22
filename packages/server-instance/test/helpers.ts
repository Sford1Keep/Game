import assert from 'node:assert/strict';

/**
 * Опрос условия с дедлайном: state sync приходит асинхронно, событийную
 * подписку на изменения не заводим — фазе 0 достаточно детерминированного
 * ожидания с явным текстом ошибки.
 */
export const waitFor = async (
  predicate: () => boolean,
  message: string,
  timeoutMs = 5_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      assert.fail(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
