/**
 * Simple event dispatcher implementation
 */
export class EventDispatcher<T = unknown> {
  private listeners: ((event: T) => void)[] = []

  /**
   * Add an event listener
   * @param listener Function to call when an event is dispatched
   */
  public addEventListener(listener: (event: T) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove an event listener
   * @param listener Function to remove
   */
  public removeEventListener(listener: (event: T) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index !== -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Dispatch an event to all listeners
   * @param event Event to dispatch
   */
  public dispatch(event: T): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  /**
   * Remove all event listeners
   */
  public clear(): void {
    this.listeners = []
  }
}
