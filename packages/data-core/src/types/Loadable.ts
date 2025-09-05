/**
 * Platform-independent interface for loadable resources.
 * Defines the contract that all resource loaders must implement.
 *
 * @interface Loadable
 * @template T The type of data that will be loaded
 * @since 0.1.0
 */
export interface Loadable<T> {
  /**
   * Data associated with a loadable resource.
   * Contains the loaded resource data once loading is complete.
   *
   * @type {T}
   */
  data: T

  /**
   * Begins loading the resource and returns a promise to be resolved on completion.
   * Implementations should handle all necessary resource loading operations.
   *
   * @returns {Promise<T>} Promise that resolves to the loaded data
   * @throws {Error} When loading fails
   */
  load(): Promise<T>

  /**
   * Returns true if the loadable resource is loaded and ready for use.
   * Should return false if the resource is still loading or has failed to load.
   *
   * @returns {boolean} True if the resource is loaded
   */
  isLoaded(): boolean
}
