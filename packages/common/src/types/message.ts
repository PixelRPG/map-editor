export interface TextMessage {
    type: 'text';
    data: string;
}

// Just for example, can be removed later
export interface ImageMessage {
    type: 'image';
    data: {
        url: string;
        alt: string;
    };
}

export interface EventMessage<T = any> {
    type: 'event';
    data: {
        name: string;
        data: any;
    };
}

export type Message = TextMessage | ImageMessage | EventMessage

