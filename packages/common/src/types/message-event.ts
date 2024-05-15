export interface MessageEvent<T = any> {
    type: 'event';
    data: T
}

