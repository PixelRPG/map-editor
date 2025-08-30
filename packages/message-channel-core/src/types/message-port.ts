import { RpcMessage } from './wire'

/**
 * Platform-agnostic message port interface
 * Each platform implementation should provide its own concrete implementation
 */
export interface MessagePort {
  /**
   * Send a message through the port
   */
  postMessage(message: RpcMessage): void

  /**
   * Start receiving messages
   */
  start(): void

  /**
   * Close the message port
   */
  close(): void
}
