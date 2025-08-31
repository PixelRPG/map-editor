import { MessagePort } from '../types/message-port'
import { MessageEventInit } from '../types/message-event-init'
import { MessageEventSource } from '../types/message-event-source'

/**
 * Polyfill for MessageEvent in GJS environment
 */
import { MessageEventBase } from '../types/message-event'

export class MessageEvent<T = unknown> implements MessageEventBase<T> {
  /**
   * Message data
   */
  public readonly data: T

  /**
   * Message origin for security
   */
  public readonly origin: string

  /**
   * Event ID for ordering
   */
  public readonly lastEventId: string

  /**
   * Message source
   */
  public readonly source: MessageEventSource | null

  /**
   * Associated ports
   */
  public readonly ports: readonly MessagePort[]

  /**
   * Create a new MessageEvent
   * @param _type Event type (unused in our implementation)
   * @param init Event initialization options
   */
  constructor(_type: string, init?: MessageEventInit<T>) {
    this.data = init?.data as T
    this.origin = init?.origin || ''
    this.lastEventId = init?.lastEventId || ''
    this.source = init?.source || null
    this.ports = init?.ports || []
  }
}
