/**
 * Send a text message to the Gtk WebView application or to the WebView client.
 * Currently only used for debugging.
 */
export interface MessageText {
    type: 'text';
    data: string;
}
