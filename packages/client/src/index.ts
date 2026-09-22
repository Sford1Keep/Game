/**
 * Точка входа `@game/client`. Публичный интерфейс — game-core модель мира;
 * сетевой адаптер и рендер подключаются в `src/main.ts` (dev-сборка Vite).
 */
export { WorldStore, type WorldPlayer } from './game-core/world.js';
