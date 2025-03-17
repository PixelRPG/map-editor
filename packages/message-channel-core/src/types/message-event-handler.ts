import type { MessageEvent } from "../polyfills/message-event.ts";

/**
 * Type definition for a message event handler
 * @param event - The message event object
 */
export type MessageEventHandler = (event: MessageEvent) => void;