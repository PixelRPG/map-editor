import { EngineCommandType } from './engine-command-type'

/**
 * Type mapping for command data based on command type
 * @deprecated Use EngineMessageDataMap instead
 */
export interface EngineCommandEventDataMap {
  [EngineCommandType.START]: { command: EngineCommandType.START }
  [EngineCommandType.STOP]: { command: EngineCommandType.STOP }
}

/**
 * Base type for all engine command data
 * @deprecated Use EngineMessageData instead
 */
export type EngineCommandEventData =
  EngineCommandEventDataMap[EngineCommandType]

/**
 * Generic engine command with typed data based on command type
 * @deprecated Use EngineMessage instead
 */
export interface EngineCommand<
  T extends EngineCommandType = EngineCommandType,
> {
  type: T
  data: EngineCommandEventDataMap[T]
}

/**
 * Command handler function type for engine commands
 * @deprecated Use EngineMessageHandler instead
 */
export type EngineCommandHandler = (
  command: EngineCommand,
) => void | Promise<void>
