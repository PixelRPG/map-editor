/**
 * Extracts the directory path from a file path
 * @param filePath The file path to extract the directory from
 * @returns The directory path with trailing slash
 */
export function extractDirectoryPath(filePath: string): string {
    console.debug(`Extracting directory path from: ${filePath}`);

    // Find the last slash in the path
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        console.debug(`No directory part found in: ${filePath}`);
        return ''; // No directory part
    }

    const result = filePath.substring(0, lastSlashIndex + 1); // Include the trailing slash
    console.debug(`Extracted directory path: ${result}`);
    return result;
}

/**
 * Normalizes a path by resolving relative path segments like '..' and '.'
 * @param path The path to normalize
 * @returns Normalized path with trailing slash if it had one
 */
export function normalizePath(path: string): string {
    console.debug(`Normalizing path: ${path}`);

    // Check if path ends with a slash
    const endsWithSlash = path.endsWith('/');

    // Split the path into segments
    const segments = path.split('/').filter(segment => segment.length > 0);
    const result: string[] = [];

    // Process each segment
    for (const segment of segments) {
        if (segment === '..') {
            // Go up one directory level by removing the last segment
            if (result.length > 0) {
                result.pop();
            }
        } else if (segment !== '.') {
            // Add the segment if it's not a current directory reference
            result.push(segment);
        }
    }

    // Reconstruct the path, preserving trailing slash if it existed
    const normalizedPath = result.length > 0
        ? result.join('/') + (endsWithSlash ? '/' : '')
        : (endsWithSlash ? '/' : '');

    console.debug(`Normalized path: ${normalizedPath}`);
    return normalizedPath;
}

/**
 * Joins path segments and normalizes the result
 * @param basePath The base path
 * @param relativePath The relative path to join
 * @returns Normalized joined path
 */
export function joinPaths(basePath: string, relativePath: string): string {
    console.debug(`Joining paths: basePath=${basePath}, relativePath=${relativePath}`);

    // Handle absolute paths in relativePath
    if (relativePath.startsWith('/')) {
        console.debug(`Relative path is absolute, returning: ${relativePath}`);
        return relativePath;
    }

    // Handle URLs in relativePath
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        console.debug(`Relative path is a URL, returning: ${relativePath}`);
        return relativePath;
    }

    // Ensure base path ends with slash if it's not empty
    const normalizedBase = basePath ?
        (basePath.endsWith('/') ? basePath : basePath + '/') : '';

    // Remove leading slash from relative path if it exists
    const normalizedRelative = relativePath.startsWith('/') ?
        relativePath.substring(1) : relativePath;

    // Join and normalize
    const result = normalizePath(normalizedBase + normalizedRelative);
    console.debug(`Joined path result: ${result}`);
    return result;
}

/**
 * Gets the filename part of a path
 * @param path The full path
 * @returns The filename without the directory part
 */
export function getFilename(path: string): string {
    console.debug(`Getting filename from path: ${path}`);

    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        console.debug(`No directory part in path, returning full path: ${path}`);
        return path; // No directory part, return the whole path
    }

    const filename = path.substring(lastSlashIndex + 1);
    console.debug(`Extracted filename: ${filename}`);
    return filename;
}