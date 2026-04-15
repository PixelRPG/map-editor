/**
 * Normalize a path into a fetch-compatible URL. In the browser, absolute
 * POSIX paths resolve relative to the origin. In GJS there is no origin, so
 * `fetch('/home/...')` raises `TypeError: Invalid URL` — prefix `file://` for
 * absolute local paths. URLs (http/https/file/data) are passed through.
 *
 * Exported so consumers can pre-normalize paths before handing them to
 * third-party libraries (e.g. Excalibur's `ImageSource`) that bypass our
 * `loadTextFile` wrapper.
 */
export function toFetchUrl(path: string): string {
    if (/^(https?|file|data|blob):/i.test(path)) return path
    if (path.startsWith('/')) return `file://${path}`
    return path
}

/**
 * Load a text file using fetch
 * @param path Path to the file
 * @returns The file contents as a string
 */
export async function loadTextFile(path: string): Promise<string> {
    const url = toFetchUrl(path)
    try {
        console.log('Loading text file:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load file: ${url} (${response.status})`);
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
