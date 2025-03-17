/**
 * Load a text file using fetch
 * @param path Path to the file
 * @returns The file contents as a string
 */
export async function loadTextFile(path: string): Promise<string> {
    try {
        console.log('Loading text file:', path);
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load file: ${path} (${response.status})`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error loading file: ${error}`);
        throw error;
    }
}

/**
 * Load and parse a JSON file
 * @param path Path to the JSON file
 * @returns Parsed JSON data
 */
export async function loadJsonFile<T>(path: string): Promise<T> {
    const content = await loadTextFile(path);
    return JSON.parse(content) as T;
}
