import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseClassConfig, type ClassConfig } from '@game/shared';

/**
 * Каталог классов игрока (T-020): стартовые HP берутся из `content/classes`,
 * а не из константы комнаты. Персонажи с `class_id` есть (T-004), но комната
 * инстанса знает только `sessionId`, поэтому на старте здесь один класс-заглушка.
 */

/** `src/` → `packages/` → корень репозитория → `content/classes`. */
const CLASSES_DIR = fileURLToPath(new URL('../../../content/classes/', import.meta.url));

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
