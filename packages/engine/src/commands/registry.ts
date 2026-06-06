import { EraseTileCommand, PaintTileCommand, type PaintTilePayload } from './paint-tile.command.ts'
import type { CommandRegistry } from './types.ts'

/**
 * Default command registry — keyed by `Command.kind`. The
 * {@link SessionController} consults this on every inbound
 * `Operation` to reconstruct the concrete command class before
 * calling `Engine.applyRemoteCommand`.
 *
 * Consumers can layer additional factories on top by spreading:
 *
 * ```ts
 * const registry: CommandRegistry = {
 *   ...BUILT_IN_COMMANDS,
 *   [MyCustomCommand.KIND]: (p) => new MyCustomCommand(p as MyPayload),
 * }
 * ```
 *
 * The `unknown` payload is the cost of a discriminated dispatch
 * across an open registry; each factory narrows on entry.
 */
export const BUILT_IN_COMMANDS: CommandRegistry = {
  [PaintTileCommand.KIND]: (payload) => new PaintTileCommand(payload as PaintTilePayload),
  [EraseTileCommand.KIND]: (payload) => new EraseTileCommand(payload as Omit<PaintTilePayload, 'spriteId'>),
}
