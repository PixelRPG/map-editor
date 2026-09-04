import type { RoomEvent } from './room-manager.ts'

/** How much of the relay's traffic reaches stdout. */
export type LogLevel = 'quiet' | 'info' | 'debug'

/** Print one room event, unless the level filters it out. */
export function logEvent(event: RoomEvent, level: LogLevel): void {
  if (level === 'quiet') return
  if (event.kind === 'message' && level !== 'debug') return
  console.log(`[signalling] ${formatEvent(event)}`)
}

/** One-line rendering of a room event. */
export function formatEvent(event: RoomEvent): string {
  switch (event.kind) {
    case 'joined':
      return `joined ${event.roomId} as ${event.role}`
    case 'left':
      return `left ${event.roomId} (${event.role}, ${event.reason})`
    case 'message':
      return `${event.roomId}: ${event.from} → ${event.to} (${event.type})`
    case 'rejected':
      return `rejected ${event.roomId}/${event.role}: ${event.reason}`
    case 'reaped':
      return `reaped ${event.roomId} (${event.reason})`
  }
}
