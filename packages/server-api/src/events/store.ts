import type { Pool, PoolClient } from 'pg';

import type { GameEvent, GameLogger } from '@game/shared';

export interface RecordedGameEvent extends GameEvent {
  id: string;
}

/**
 * Запись игровых событий в `game_events` (TECH-SPEC 10.2, T-011). Только `insert`:
 * append-only держится и на уровне БД (триггер в миграции 0002), поэтому повторная
 * запись того же события — вторая строка, а не перезапись первой.
 */
export class GameEventStore {
  constructor(
    private readonly db: Pool | PoolClient,
    private readonly log: GameLogger,
  ) {}

  async record(event: GameEvent): Promise<RecordedGameEvent> {
    const { rows } = await this.db.query<{ id: string }>(
      `insert into game_events (type, actor_id, instance_id, payload, occurred_at)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        event.type,
        event.actorId,
        event.instanceId,
        JSON.stringify(event.payload),
        event.timestamp.toISOString(),
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) {
      throw new Error(`game_events: insert не вернул id события типа ${event.type}`);
    }
    this.log.debug({ eventId: id, type: event.type, actorId: event.actorId }, 'событие записано');
    return { ...event, id };
  }
}
