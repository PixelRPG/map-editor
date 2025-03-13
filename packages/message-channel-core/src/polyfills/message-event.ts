/**
 * Polyfill for standard DOM MessageEvent in GJS environments
 * This implements the basic interface needed for our messaging system
 */

import type { MessageEventInit, MessagePort, MessageEventSource } from "../types/index.ts";

/**
 * Implementation of the standard DOM MessageEvent for GJS
 */
export class MessageEvent<T = any> {
    /**
     * The type of the event, in this case 'message'
     */
    readonly type: string;

    /**
     * The data payload of the message
     */
    readonly data: T;

    /**
     * Origin of the message, for security checks
     */
    readonly origin: string;

    /**
     * ID of the last event, used for event ordering
     */
    readonly lastEventId: string;

    /**
     * Source window of the message
     */
    readonly source: MessageEventSource;

    /**
     * MessagePorts for communication channels
     */
    readonly ports: MessagePort[];

    /**
     * Create a new MessageEvent
     * @param type Type of the event (usually 'message')
     * @param init Initialization options
     */
    constructor(type: string, init: MessageEventInit<T> = {}) {
        this.type = type;
        this.data = init.data as T;
        this.origin = init.origin || '';
        this.lastEventId = init.lastEventId || '';
        this.source = init.source || null;
        this.ports = [...(init.ports || [])];
    }
}
