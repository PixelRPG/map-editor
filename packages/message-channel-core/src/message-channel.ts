import type { MessageEvent } from './polyfills/message-event'
import { BaseMessage } from './types/wire'

/**
 * Error thrown when message channel operations fail.
 *
 * @class MessageChannelError
 * @extends Error
 * @since 0.1.0
 */
export class MessageChannelError extends Error {
  /**
   * The operation that failed
   */
  public readonly operation: string

  /**
   * Additional context about the failure
   */
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    operation: string,
    context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MessageChannelError'
    this.operation = operation
    this.context = context
  }
}

/**
 * Type guard for messages with channel property.
 * Checks if the provided data conforms to the BaseMessage interface.
 *
 * @param data - The data to check
 * @returns True if the data is a valid BaseMessage
 *
 * @example
 * ```typescript
 * if (isChannelMessage(event.data)) {
 *   console.log('Channel:', event.data.channel);
 * }
 * ```
 */
function isChannelMessage(data: unknown): data is BaseMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as BaseMessage).channel === 'string'
  )
}

/**
 * Messaging channel based on WHATWG standards for message passing.
 * Provides a unified API for sending and receiving messages between
 * different contexts (GJS and WebView) using web standards.
 *
 * This abstract class implements the core messaging functionality that
 * platform-specific implementations can extend.
 *
 * @abstract
 * @class MessageChannel
 * @since 0.1.0
 */
export abstract class MessageChannel {
  /**
   * Handler for message events (standard DOM pattern).
   * Follows the WHATWG MessagePort interface specification.
   */
  private _onmessage: ((event: MessageEvent) => void) | null = null

  /**
   * Handler for error events.
   * Called when message processing or transmission fails.
   */
  private _onerror: ((error: MessageChannelError) => void) | null = null

  /**
   * Standard onmessage property following the DOM pattern.
   * Receives the raw MessageEvent as defined in WHATWG specifications.
   *
   * @type {((event: MessageEvent) => void) | null}
   */
  get onmessage(): ((event: MessageEvent) => void) | null {
    return this._onmessage
  }

  /**
   * Set message handler following standard DOM pattern.
   * The handler receives the raw MessageEvent, not a custom type.
   *
   * @param handler - The message event handler function
   */
  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this._onmessage = handler
  }

  /**
   * Error event handler property.
   * Allows setting custom error handling for message channel failures.
   *
   * @type {((error: MessageChannelError) => void) | null}
   */
  get onerror(): ((error: MessageChannelError) => void) | null {
    return this._onerror
  }

  set onerror(handler: ((error: MessageChannelError) => void) | null) {
    this._onerror = handler
  }

  /**
   * Create a new messaging channel with the given channel name.
   *
   * @param channelName - Unique identifier for this communication channel
   * @throws {MessageChannelError} When channelName is invalid
   *
   * @example
   * ```typescript
   * const channel = new MyMessageChannel('game-events');
   * ```
   */
  constructor(protected readonly channelName: string) {
    if (!channelName || typeof channelName !== 'string') {
      throw new MessageChannelError(
        'Channel name must be a non-empty string',
        'constructor',
        { channelName },
      )
    }
  }

  /**
   * Send a message through the channel.
   * Standard-compliant method that takes a single data parameter.
   * Implementations should handle serialization and transmission.
   *
   * @abstract
   * @param data - Any serializable data to send via the channel
   * @returns Promise that resolves when the message is sent
   * @throws {MessageChannelError} When message cannot be sent
   *
   * @example
   * ```typescript
   * await channel.postMessage({ type: 'player-move', x: 10, y: 20 });
   * ```
   */
  abstract postMessage(data: unknown): Promise<void>

  /**
   * Handle incoming standard MessageEvent.
   * This method processes received messages and dispatches them to handlers.
   *
   * @protected
   * @param event - The incoming message event
   */
  protected handleMessageEvent(event: MessageEvent): void {
    try {
      // Validate the message structure
      if (!isChannelMessage(event.data)) {
        if (this._onerror) {
          this._onerror(
            new MessageChannelError(
              'Received message does not conform to channel message format',
              'handleMessageEvent',
              { data: event.data },
            ),
          )
        }
        return
      }

      // Check if the message is for this channel
      if (event.data.channel && event.data.channel !== this.channelName) {
        // Message is for a different channel, ignore it
        return
      }

      // Call the standard onmessage handler if set
      if (this._onmessage) {
        this._onmessage(event)
      }
    } catch (error) {
      if (this._onerror) {
        this._onerror(
          new MessageChannelError(
            `Failed to handle message event: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'handleMessageEvent',
            { originalError: error },
          ),
        )
      }
    }
  }

  /**
   * Close the message channel and clean up resources.
   * Should be called when the channel is no longer needed.
   *
   * @abstract
   */
  abstract close(): void
}
