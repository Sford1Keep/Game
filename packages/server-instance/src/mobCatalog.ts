import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseMobConfig, type MobConfig } from '@game/shared';

/**
 * Каталог мобов (T-015): конфиги `content/mobs` — второй читатель `/content`
 * на сервере после каталога способностей (T-014). Правила те же: загрузка на
 * создание комнаты, битый конфиг — исключение, а не тихий пропуск.
 */

/** `src/` → `packages/` → корень репозитория → `content/mobs`. */
const MOBS_DIR = fileURLToPath(new URL('../../../content/mobs/', import.meta.url));

export const loadMobCatalog = (dir: string = MOBS_DIR): Map<string, MobConfig> => {
  const catalog = new Map<string, MobConfig>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const parsed = parseMobConfig(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    if (parsed === undefined) {
      throw new Error(`битый конфиг моба: ${file}`);
    }
    catalog.set(parsed.id, parsed);
  }
  return catalog;
};
