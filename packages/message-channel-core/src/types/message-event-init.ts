import { MessagePort } from './message-port'
import { MessageEventSource } from './message-event-source'

/**
 * Message event initialization options
 */
export interface MessageEventInit<T = unknown> {
  /** Message data */
  data?: T
  /** Message origin for security */
  origin?: string
  /** Event ID for ordering */
  lastEventId?: string
  /** Message source */
  source?: MessageEventSource | null
  /** Associated ports */
  ports?: MessagePort[]
}
