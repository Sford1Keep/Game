import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDodgeConfig, type DodgeConfig } from '@game/shared';

/**
 * Каталог механик (T-020): параметры уклонения переехали из констант комнаты
 * в `content/mechanics` — решение T-013 («уклонение вне конфигов») отменено
 * приказом лиду: дистанция и кулдаун — баланс, а баланс живёт в `/content`.
 */

/** `src/` → `packages/` → корень репозитория → `content/mechanics`. */
const MECHANICS_DIR = fileURLToPath(new URL('../../../content/mechanics/', import.meta.url));

export const loadMechanicCatalog = (dir: string = MECHANICS_DIR): Map<string, DodgeConfig> => {
  const catalog = new Map<string, DodgeConfig>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const parsed = parseDodgeConfig(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')));
    if (parsed === undefined) {
      throw new Error(`битый конфиг механики: ${file}`);
    }
    catalog.set(parsed.id, parsed);
  }
  return catalog;
};
