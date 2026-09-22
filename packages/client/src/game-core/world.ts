import type { Vector2 } from '@game/shared';

/**
 * game-core: модель мира клиента на чистом TS. НЕ импортирует Phaser/DOM и
 * сетевой клиент (TECH-SPEC 3) — только принимает данные из сетевого адаптера
 * и отдаёт их слою рендера.
 */
export interface WorldPlayer {
  id: string;
  position: Vector2;
}

export class WorldStore {
  private readonly players = new Map<string, WorldPlayer>();

  /** Сессия локального игрока — чтобы рендер выделял его среди остальных. */
  localId = '';

  replace(players: readonly WorldPlayer[]): void {
    this.players.clear();
    for (const p of players) {
      this.players.set(p.id, { id: p.id, position: { x: p.position.x, y: p.position.y } });
    }
  }

  /** Снапшот для рендера: стабильный порядок (сортировка по id), мутации запрещены. */
  roster(): readonly WorldPlayer[] {
    return [...this.players.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get size(): number {
    return this.players.size;
  }
}
