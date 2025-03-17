/**
 * Interface matching the standard DOM MessageEventInit
 */
export interface MessageEventInit<T = any> {
    data?: T;
    origin?: string;
    lastEventId?: string;
    source?: any;
    ports?: ReadonlyArray<any>;
}