/**
 * Значения ниже в GDD/TECH-SPEC не заданы — предложены исполнителем под нужды
 * T-003 (регистрация/вход) и сезонной модели (GDD 10), требуют утверждения лидом.
 */

/** Статус аккаунта. `Suspended` — вход блокируется на стороне API-сервера. */
export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended',
}

/** Статус персонажа. `Archived` — выбыл по итогам смены сезона, данные не удаляются. */
export enum CharacterStatus {
  Active = 'active',
  Archived = 'archived',
}
