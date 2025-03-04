/**
 * Just an example how files could be handled in messages.
 * Currently not used.
 */
export interface MessageFile {
    type: 'file';
    data: {
        url: string;
        type: string;
        name: string;
    };
}
