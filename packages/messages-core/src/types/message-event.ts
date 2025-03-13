import type { MessageEventSource } from './message-event-source.ts';
import type { MessagePort } from './message-port.ts';

/**
 * MessageEvent interface for GJS environment
 * This mirrors the web standard MessageEvent interface
 */
export interface MessageEventT<T = any> {
    /**
     * Type of the event
     */
    readonly type: string;

    /**
     * Data payload of the message
     */
    readonly data: T;

    /**
     * Origin of the message
     */
    readonly origin: string;

    /**
     * Last event ID
     */
    readonly lastEventId: string;

    /**
     * Source of the message
     */
    readonly source: MessageEventSource;

    /**
     * MessagePorts associated with the message
     */
    readonly ports: MessagePort[];
}