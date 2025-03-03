/**
 * Interface for resource providers across different platforms
 * This allows both Excalibur.js and GJS implementations to follow a common pattern
 */
export interface ResourceProvider<T, D = T> {
    /**
     * Whether the resource is loaded
     */
    isLoaded(): boolean;

    /**
     * Load the resource
     * Note: Platform-specific implementations may override this with 
     * a compatible signature that returns a platform-specific type
     * But they must ensure getData() returns the correct type T
     */
    load(): Promise<D>;

    /**
     * Get the resource data
     */
    getData(): T;

    /**
     * Save the resource data to a file
     * @param path Optional path to save to (defaults to the original path)
     */
    saveToFile?(path?: string): Promise<boolean>;
}
