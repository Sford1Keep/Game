import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseClassConfig, type ClassConfig } from '@game/shared';

/**
 * Каталог классов на стороне API (T-004): `classId` при создании персонажа
 * сверяется с `content/classes/*.json` — персонаж может ссылаться только на
 * существующий конфиг. Тот же порядок, что у каталогов `server-instance`:
 * загрузка на старт процесса, битый конфиг — исключение, а не тихий пропуск.
 */

/** `src/characters/` → `server-api/` → `packages/` → корень → `content/classes`. */
const CLASSES_DIR = fileURLToPath(new URL('../../../../content/classes/', import.meta.url));

export const loadClassCatalog = (dir: string = CLASSES_DIR): Map<string, ClassConfig> => {
  const catalog = new Map<string, ClassConfig>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const parsed = parseClassConfig(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    if (parsed === undefined) {
      throw new Error(`битый конфиг класса: ${file}`);
    }
    catalog.set(parsed.id, parsed);
  }
  return catalog;
};
