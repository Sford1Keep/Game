/**
 * Точка входа `@game/client`. Публичный интерфейс — game-core (модель мира и
 * предсказание движения); сетевой адаптер и рендер подключаются в `src/main.ts`
 * (dev-сборка Vite).
 */
export { WorldStore, type WorldPlayer } from './game-core/world.js';
export {
  LOCAL_SPEED,
  MovementController,
  SEND_INTERVAL_MS,
  SNAP_TOLERANCE,
  type MovementDeps,
} from './game-core/movement.js';
