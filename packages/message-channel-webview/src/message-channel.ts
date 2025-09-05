import {
  MessageChannel as CoreMessageChannel,
  MessageEvent,
} from '@pixelrpg/message-channel-core'
import { WebKitMessageHandler } from './types/webkit-message-handler'

/**
 * Combined WebKit and Window message implementation for web context.
 * This implementation tries WebKit message handlers first (for native communication),
 * then falls back to standard Window message API.
 */
export class MessageChannel extends CoreMessageChannel {
  /**
   * Reference to the WebKit message handler, if available
   */
  get webKitHandler(): WebKitMessageHandler | null {
    return window.webkit?.messageHandlers[this.channelName] || null
  }

  /**
   * Create a new WebView message channel
   * @param channelName Name of the message channel
   */
  constructor(channelName: string) {
    super(channelName)
    this.initializeChannel()
  }

  /**
   * Send a message using WebKit handler
   * @param data Data to send
   */
  async postMessage(data: any): Promise<void> {
    if (!this.isHandlerRegistered()) {
      console.warn('WebKit message handler not available')
      return
    }

    // Add channel information if not present
    if (typeof data === 'object' && data !== null && !('channel' in data)) {
      data.channel = this.channelName
    }

    // Send via WebKit handler
    this.webKitHandler?.postMessage(data)
    return Promise.resolve()
  }

  /**
   * Initialize both WebKit and Window message channels
   */
  protected initializeChannel(): void {
    console.log('Initializing WebKit message channel', this.channelName)

    // Set up window message listener for receiving messages
    window.addEventListener('message', (event) => {
      this.handleMessageEvent(event as unknown as MessageEvent)
    })
  }

  /**
   * Method to check if message handler is registered
   */
  protected isHandlerRegistered(): boolean {
    return this.webKitHandler !== null
  }

  /**
   * Close the message channel and clean up resources.
   * Removes event listeners and clears references.
   */
  close(): void {
    try {
      // Remove window message event listener
      window.removeEventListener('message', this.handleMessageEvent as any)
      console.log(`MessageChannel '${this.channelName}' closed`)
    } catch (error) {
      console.error(
        `Error closing MessageChannel '${this.channelName}':`,
        error,
      )
    }
  }
}
