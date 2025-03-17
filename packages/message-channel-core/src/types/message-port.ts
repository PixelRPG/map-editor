type Transferable = any; // TODO

/**
 * MessagePort interface stub for compatibility
 */
export interface MessagePort /*extends EventTarget*/ {
    postMessage(message: any, transfer?: Transferable[]): void;
    start(): void;
    close(): void;
}