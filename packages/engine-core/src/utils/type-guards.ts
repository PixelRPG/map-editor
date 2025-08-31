import { RpcEngineType, RpcEngineParamMap } from '../types/rpc-engine'
import { EngineStatus } from '../types/engine-status'

// Cache for performance optimization
const RPC_ENGINE_TYPE_VALUES = new Set(Object.values(RpcEngineType))
const ENGINE_STATUS_VALUES = new Set(Object.values(EngineStatus))

/**
 * Type guard to check if a value is a valid RpcEngineType
 * Optimized with cached Set lookup for better performance
 */
export function isRpcEngineType(value: unknown): value is RpcEngineType {
  return (
    typeof value === 'string' &&
    RPC_ENGINE_TYPE_VALUES.has(value as RpcEngineType)
  )
}

/**
 * Type guard to check if an engine event is valid
 * Optimized with early returns and reduced object property access
 */
export function isEngineEvent(event: unknown): event is {
  type: RpcEngineType
  data: RpcEngineParamMap[keyof RpcEngineParamMap]
} {
  if (typeof event !== 'object' || event === null) {
    return false
  }

  const e = event as Record<string, unknown>
  return 'type' in e && 'data' in e && isRpcEngineType(e.type)
}

/**
 * Type guard to check if a value is a valid EngineStatus
 * Optimized with cached Set lookup for better performance
 */
export function isEngineStatus(value: unknown): value is EngineStatus {
  return (
    typeof value === 'string' && ENGINE_STATUS_VALUES.has(value as EngineStatus)
  )
}

/**
 * Type guard to check if parameters are valid for a specific RPC engine type
 */
export function isValidRpcEngineParams<K extends RpcEngineType>(
  type: K,
  params: unknown,
): params is RpcEngineParamMap[K] {
  switch (type) {
    case RpcEngineType.START:
    case RpcEngineType.STOP:
      return params == null // null or undefined

    case RpcEngineType.LOAD_PROJECT:
    case RpcEngineType.PROJECT_LOADED: {
      if (typeof params !== 'object' || params === null) return false
      const p = params as Record<string, unknown>
      return (
        'projectPath' in p &&
        typeof p.projectPath === 'string' &&
        (p.options === undefined || typeof p.options === 'object')
      )
    }

    case RpcEngineType.LOAD_MAP:
    case RpcEngineType.MAP_LOADED: {
      if (typeof params !== 'object' || params === null) return false
      const p = params as Record<string, unknown>
      return 'mapId' in p && typeof p.mapId === 'string'
    }

    case RpcEngineType.STATUS_CHANGED:
      return isEngineStatus(params)

    case RpcEngineType.ERROR: {
      if (typeof params !== 'object' || params === null) return false
      const p = params as Record<string, unknown>
      return (
        'message' in p &&
        typeof p.message === 'string' &&
        (p.error === undefined || p.error instanceof Error)
      )
    }

    case RpcEngineType.INPUT_EVENT:
    case RpcEngineType.HANDLE_INPUT_EVENT:
      // This would need more detailed validation for InputEvent
      return typeof params === 'object' && params !== null

    case RpcEngineType.NOTIFY_ENGINE_EVENT: {
      if (typeof params !== 'object' || params === null) return false
      const p = params as Record<string, unknown>
      return 'type' in p && 'data' in p && isRpcEngineType(p.type)
    }

    default:
      return false
  }
}
