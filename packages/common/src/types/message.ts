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

export type Message = TextMessage | ImageMessage

