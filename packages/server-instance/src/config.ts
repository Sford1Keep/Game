export interface InstanceConfig {
  port: number;
  hostname: string;
}

// 2600, а не 2567 (дефолт Colyseus-примеров): на dev-машинах его может держать
// другой локальный сервис.
export const loadConfig = (env: NodeJS.ProcessEnv): InstanceConfig => {
  const port = env.INSTANCE_PORT !== undefined ? Number(env.INSTANCE_PORT) : 2600;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`INSTANCE_PORT: некорректное значение ${JSON.stringify(env.INSTANCE_PORT)}`);
  }
  return { port, hostname: env.INSTANCE_HOSTNAME ?? '127.0.0.1' };
};
