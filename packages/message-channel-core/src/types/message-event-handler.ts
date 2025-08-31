import type { MessageEventBase } from "./message-event";

/**
 * Type definition for a message event handler
 * @param event - The message event object
 */
export type MessageEventHandler = (event: MessageEventBase) => void;