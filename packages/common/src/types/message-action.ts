/**
 * Send an Action with optional data over postMessage.
 * A Action is a request to perform an action on the other side.
 * For specific Message Action types see the other Interface with the `MessageAction` prefix.
 */
export interface MessageAction<T = any> {
    type: 'action';
    data: T
}

