/**
 * Interface for the result of a file load operation
 */
export interface FileLoadResult<T = any> {
    success: boolean;
    data?: T;
    error?: Error;
}

/**
 * Interface for the result of a file save operation
 */
export interface FileSaveResult {
    success: boolean;
    error?: Error;
}

/**
 * Loads a JSON file from the specified path
 * @param path Path to the JSON file
 * @returns Promise resolving to the parsed JSON data
 * @throws Error if the file cannot be loaded or parsed
 */
export async function loadJsonFile<T = any>(path: string): Promise<T> {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            const error = new Error(`Failed to load JSON file: ${response.statusText}`);
            console.error(`Error loading JSON file from ${path}:`, error);
            throw error;
        }

        const data = await response.json();
        return data as T;
    } catch (error) {
        console.error(`Error loading JSON file from ${path}:`, error);
        throw error;
    }
}

/**
 * Saves data as a JSON file to the specified path
 * @param path Path to save the JSON file
 * @param data Data to save as JSON
 * @param pretty Whether to pretty-print the JSON (default: true)
 * @returns Promise resolving to a FileSaveResult
 */
export async function saveJsonFile<T = any>(path: string, data: T, pretty: boolean = true): Promise<FileSaveResult> {
    try {
        // In a web environment, saving files requires user interaction
        // This is a placeholder implementation that would need to be replaced
        // with actual file saving logic using the File System Access API or similar

        console.warn('saveJsonFile not implemented for web environment');
        console.info('To save files in a web environment, you would need to use:');
        console.info('1. The File System Access API (for modern browsers)');
        console.info('2. A file download mechanism (for older browsers)');
        console.info('3. Or a server-side API endpoint to handle the save operation');

        return {
            success: false,
            error: new Error('File saving not implemented in web environment')
        };
    } catch (error) {
        console.error(`Error saving JSON file to ${path}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
} 