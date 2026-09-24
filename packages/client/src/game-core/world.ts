import type { Vector2 } from '@game/shared';

/**
 * game-core: модель мира клиента на чистом TS. НЕ импортирует Phaser/DOM и
 * сетевой клиент (TECH-SPEC 3) — только принимает данные из сетевого адаптера
 * и отдаёт их слою рендера.
 */
export interface WorldPlayer {
  id: string;
  position: Vector2;
  hp: number;
  maxHp: number;
}

export interface WorldMob {
  id: string;
  position: Vector2;
  hp: number;
  maxHp: number;
  statuses: readonly string[];
}

export interface DamageEvent {
  targetId: string;
  amount: number;
}

export class WorldStore {
  private readonly players = new Map<string, WorldPlayer>();
  private readonly mobs = new Map<string, WorldMob>();
  private readonly damageEvents: DamageEvent[] = [];

  /** Сессия локального игрока — чтобы рендер выделял его среди остальных. */
  localId = '';

  replace(players: readonly WorldPlayer[], mobs: readonly WorldMob[] = []): void {
    this.players.clear();
    for (const p of players) {
      this.players.set(p.id, {
        id: p.id,
        position: { x: p.position.x, y: p.position.y },
        hp: p.hp,
        maxHp: p.maxHp,
      });
    }
    this.mobs.clear();
    for (const mob of mobs) {
      this.mobs.set(mob.id, {
        id: mob.id,
        position: { x: mob.position.x, y: mob.position.y },
        hp: mob.hp,
        maxHp: mob.maxHp,
        statuses: [...mob.statuses],
      });
    }
  }

  /** Снапшот для рендера: стабильный порядок (сортировка по id), мутации запрещены. */
  roster(): readonly WorldPlayer[] {
    return [...this.players.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  mobRoster(): readonly WorldMob[] {
    return [...this.mobs.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  addDamage(event: DamageEvent): void {
    if (Number.isFinite(event.amount) && event.amount > 0 && event.targetId.length > 0) {
      this.damageEvents.push({ targetId: event.targetId, amount: event.amount });
    }
  }

  drainDamage(): readonly DamageEvent[] {
    const events = this.damageEvents.splice(0);
    return events;
  }

  /** Позиция локального игрока из предсказания — рендерит её, а не снапшот сервера. */
  setLocalPosition(pos: Vector2): void {
    const local = this.players.get(this.localId);
    if (local !== undefined) {
      local.position = { x: pos.x, y: pos.y };
    }
  }

  get(id: string): WorldPlayer | undefined {
    return this.players.get(id);
  }

  get size(): number {
    return this.players.size;
  }
}
