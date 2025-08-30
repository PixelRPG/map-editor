/**
 * Type-safe event listener ID
 */
export type EventListenerId = symbol

/**
 * Enhanced event dispatcher with improved type safety and performance
 */
export class EventDispatcher<T = unknown> {
  private listeners = new Map<EventListenerId, (event: T) => void>()
  private nextId = 0

  /**
   * Add an event listener and return its ID for later removal
   * @param listener Function to call when an event is dispatched
   * @returns Unique ID for the listener
   */
  public addEventListener(listener: (event: T) => void): EventListenerId {
    const id = Symbol(`listener-${++this.nextId}`)
    this.listeners.set(id, listener)
    return id
  }

  /**
   * Add an event listener (legacy method for backward compatibility)
   * @param listener Function to call when an event is dispatched
   * @deprecated Use addEventListener that returns EventListenerId for better memory management
   */
  public on(listener: (event: T) => void): void {
    const id = Symbol(`listener-${++this.nextId}`)
    this.listeners.set(id, listener)
  }

  /**
   * Remove an event listener by its ID
   * @param listenerId ID of the listener to remove
   */
  public removeEventListener(listenerId: EventListenerId): void {
    this.listeners.delete(listenerId)
  }

  /**
   * Remove an event listener by reference (legacy method for compatibility)
   * @param listener Function to remove
   * @deprecated Use removeEventListener with ID instead
   */
  public removeEventListenerByRef(listener: (event: T) => void): void {
    for (const [id, storedListener] of this.listeners.entries()) {
      if (storedListener === listener) {
        this.listeners.delete(id)
        break
      }
    }
  }

  /**
   * Remove an event listener (legacy method for backward compatibility)
   * @param listener Function to remove
   * @deprecated Use removeEventListener with ID instead
   */
  public off(listener: (event: T) => void): void {
    this.removeEventListenerByRef(listener)
  }

  /**
   * Dispatch an event to all listeners with error handling
   * Optimized to avoid array creation when no listeners exist
   * @param event Event to dispatch
   */
  public dispatch(event: T): void {
    if (this.listeners.size === 0) return

    // Create a snapshot of listeners to avoid issues if listeners modify the list
    const currentListeners = Array.from(this.listeners.values())

    for (const listener of currentListeners) {
      try {
        listener(event)
      } catch (error) {
        // Log the error but continue with other listeners
        console.error('Event listener threw an error:', error)
      }
    }
  }

  /**
   * Dispatch an event asynchronously to all listeners
   * Optimized to avoid array creation and promise overhead when no listeners exist
   * @param event Event to dispatch
   * @returns Promise that resolves when all listeners have been called
   */
  public async dispatchAsync(event: T): Promise<void> {
    if (this.listeners.size === 0) return

    const currentListeners = Array.from(this.listeners.values())
    const promises: Promise<void>[] = []

    for (const listener of currentListeners) {
      promises.push(
        new Promise<void>((resolve) => {
          try {
            const result = listener(event) as any
            if (result && typeof result.then === 'function') {
              result
                .then(() => resolve())
                .catch((error: Error) => {
                  console.error('Async event listener threw an error:', error)
                  resolve() // Continue with other listeners
                })
            } else {
              resolve()
            }
          } catch (error) {
            console.error('Event listener threw an error:', error)
            resolve()
          }
        }),
      )
    }

    await Promise.all(promises)
  }

  /**
   * Get the number of registered listeners
   */
  public get listenerCount(): number {
    return this.listeners.size
  }

  /**
   * Check if there are any listeners registered
   */
  public get hasListeners(): boolean {
    return this.listeners.size > 0
  }

  /**
   * Remove all event listeners
   */
  public clear(): void {
    this.listeners.clear()
  }

  /**
   * Get all listener IDs (for debugging/testing purposes)
   */
  public getListenerIds(): EventListenerId[] {
    return Array.from(this.listeners.keys())
  }
}
