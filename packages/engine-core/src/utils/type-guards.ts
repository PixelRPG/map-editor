import { EngineStatus } from '../types/engine-status.ts'

const ENGINE_STATUS_VALUES = new Set(Object.values(EngineStatus))

export function isEngineStatus(value: unknown): value is EngineStatus {
  return typeof value === 'string' && ENGINE_STATUS_VALUES.has(value as EngineStatus)
}
