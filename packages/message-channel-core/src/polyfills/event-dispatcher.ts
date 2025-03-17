import type { EventListener } from '../types/event-listener.ts';

/**
 * Simple event dispatcher for typed events
 */
export class EventDispatcher<T> {
  private listeners: EventListener<T>[] = [];

  /**
   * Add a listener to this event dispatcher
   * @param listener Function to call when event is dispatched
   */
  public addEventListener(listener: EventListener<T>): void {
    this.listeners.push(listener);
  }

  /**
   * Alias for addEventListener, with a more concise API
   * @param listener Function to call when event is dispatched
   */
  public on(listener: EventListener<T>): void {
    this.addEventListener(listener);
  }

  /**
   * Remove a previously registered listener
   * @param listener Listener to remove
   */
  public removeEventListener(listener: EventListener<T>): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Alias for removeEventListener, with a more concise API
   * @param listener Listener to remove
   */
  public off(listener: EventListener<T>): void {
    this.removeEventListener(listener);
  }

  /**
   * Dispatch an event to all listeners
   * @param event Event to dispatch
   */
  public dispatch(event: T): void {
    // Create a copy of the listeners array to allow listeners to remove themselves during execution
    const currentListeners = [...this.listeners];
    for (const listener of currentListeners) {
      listener(event);
    }
  }
} 