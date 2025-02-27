export interface MapResourceOptions {
    /**
     * Plugin will operate in headless mode and skip all graphics related
     * excalibur items including creating ImageSource's
     * Default false.
     */
    headless?: boolean;

    /**
     * Base path for loading external resources like tilesets
     * Default is empty string
     */
    basePath?: string;
}