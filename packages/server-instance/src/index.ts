import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { Server, WebSocketTransport } from 'colyseus';

import { type InstanceConfig, loadConfig } from './config.js';
import { BaseInstanceRoom } from './rooms/baseInstanceRoom.js';

// Единая точка входа пакета (TECH-SPEC 3, 7): наружу — комната, state и запуск.
export { BaseInstanceRoom } from './rooms/baseInstanceRoom.js';
export { InstanceState, PlayerState, SPAWN_POINT } from './state.js';

/** Имя комнаты в матчмейкинге — под ним клиент просит инстанс (TECH-SPEC 2, 4). */
export const INSTANCE_ROOM_NAME = 'instance';

export interface RunningInstanceServer {
  server: Server;
  port: number;
}

export const startServer = async (config: InstanceConfig): Promise<RunningInstanceServer> => {
  const server = new Server({
    transport: new WebSocketTransport(),
    greet: false,
    // Сигналы процесса обрабатывает caller (см. main), не авто-shutdown библиотеки.
    gracefullyShutdown: false,
  });

  server.define(INSTANCE_ROOM_NAME, BaseInstanceRoom);
  await server.listen(config.port, config.hostname);

  const address = server.transport.server?.address();
  if (address === undefined || address === null || typeof address === 'string') {
    throw new Error('ожидался TCP-порт после listen');
  }
  return { server, port: (address as AddressInfo).port };
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const { server, port } = await startServer(loadConfig(process.env));
  console.warn(`server-instance: комната '${INSTANCE_ROOM_NAME}' слушает ws://127.0.0.1:${port}`);

  const shutdown = (): void => {
    void server.gracefullyShutdown(false).finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
