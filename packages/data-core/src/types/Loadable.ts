/**
 * An interface describing loadable resources in Excalibur.
 */
export interface Loadable<T> {
  /**
   * Data associated with a loadable
   */
  data: T;

  /**
   * Begins loading the resource and returns a promise to be resolved on completion
   */
  load(): Promise<T>;

  /**
   * Returns true if the loadable is loaded
   */
  isLoaded(): boolean;
}
