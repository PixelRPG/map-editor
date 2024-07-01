/**
 * Send an Event to the Gtk WebView application or to the WebView client with optional data over postMessage.
 * For specific Message Event types see the other Interface with the `MessageEvent` prefix.
 */
export interface MessageEvent<T = any> {
    type: 'event';
    data: T
}

