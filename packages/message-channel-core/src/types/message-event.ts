import { MessagePort } from './message-port'
import { MessageEventSource } from './message-event-source'

/**
 * Platform-agnostic message event interface
 * Each platform implementation should provide its own concrete implementation
 */
export interface MessageEventBase<T = unknown> {
  /** Message data */
  readonly data: T
  /** Message origin for security */
  readonly origin: string
  /** Event ID for ordering */
  readonly lastEventId: string
  /** Message source */
  readonly source: MessageEventSource | null
  /** Associated ports */
  readonly ports: readonly MessagePort[]
}
