import { MessagePort } from './message-port'

/**
 * Message source in platform-agnostic way
 * Each platform can extend this with its own sources
 */
export type MessageEventSource = MessagePort
