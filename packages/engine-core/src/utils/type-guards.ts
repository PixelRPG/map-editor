import { RpcEngineType, RpcEngineParamMap } from '../types/rpc-engine'

/**
 * Type guard for engine events
 */
export function isEngineEvent(
  event: unknown,
): event is RpcEngineParamMap[RpcEngineType.NOTIFY_ENGINE_EVENT] {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    'data' in event &&
    typeof (event as any).type === 'string' &&
    Object.values(RpcEngineType).includes((event as any).type)
  )
}
