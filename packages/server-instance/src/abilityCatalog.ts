import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseAbilityConfig, type AbilityConfig } from '@game/shared';

/**
 * Каталог способностей (T-014): конфиги `/content/abilities` (формат — T-009,
 * схема — T-012) — первый читатель `/content` на сервере. Загрузка одна на
 * создание комнаты: контент — данные, но на старте; hot-reload не в скоупе.
 */

/** `src/` → `packages/` → корень репозитория → `content/abilities`. */
const ABILITIES_DIR = fileURLToPath(new URL('../../../content/abilities/', import.meta.url));

/**
 * Битый конфиг — исключение, а не тихий пропуск: комната с половиной
 * способностей опаснее падения на старте.
 */
export const loadAbilityCatalog = (dir: string = ABILITIES_DIR): Map<string, AbilityConfig> => {
  const catalog = new Map<string, AbilityConfig>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const parsed = parseAbilityConfig(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    if (parsed === undefined) {
      throw new Error(`битый конфиг способности: ${file}`);
    }
    catalog.set(parsed.id, parsed);
  }
  return catalog;
};
