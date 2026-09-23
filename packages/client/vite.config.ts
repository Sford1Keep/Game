import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * `/content` раздаётся клиенту как статические данные (TECH-SPEC 6: числа
 * баланса живут в конфигах, не в коде): бутстрап `src/main.ts` читает их
 * через fetch и валидирует парсерами `@game/shared`.
 */
export default defineConfig({
  publicDir: fileURLToPath(new URL('../../content', import.meta.url)),
});
