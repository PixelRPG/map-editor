/**
 * Extracts the directory path from a file path
 * @param filePath The file path to extract the directory from
 * @returns The directory path with trailing slash
 */
export function extractDirectoryPath(filePath: string): string {
    // Find the last slash in the path
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return ''; // No directory part
    }

    return filePath.substring(0, lastSlashIndex + 1); // Include the trailing slash
}

/**
 * Normalizes a path by resolving relative path segments like '..' and '.'
 * @param path The path to normalize
 * @returns Normalized path with trailing slash if it had one
 */
export function normalizePath(path: string): string {
    // Special handling for URLs with protocol to preserve double slash
    if (path.match(/^https?:\/\//)) {
        const urlParts = path.split('://');
        const protocol = urlParts[0];
        const restOfUrl = urlParts.slice(1).join('://'); // Handle any additional :// in the URL

        // Normalize the rest of the URL without affecting protocol
        const normalizedRest = normalizePathWithoutProtocol(restOfUrl);
        return `${protocol}://${normalizedRest}`;
    }

    return normalizePathWithoutProtocol(path);
}

/**
 * Helper function to normalize path segments without affecting URL protocols
 * @private
 */
function normalizePathWithoutProtocol(path: string): string {
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
    return result.length > 0
        ? result.join('/') + (endsWithSlash ? '/' : '')
        : (endsWithSlash ? '/' : '');
}

/**
 * Joins path segments and normalizes the result
 * @param basePath The base path
 * @param relativePath The relative path to join
 * @returns Normalized joined path
 */
export function joinPaths(basePath: string, relativePath: string): string {
    // Handle absolute paths in relativePath
    if (relativePath.startsWith('/')) {
        // If basePath is a URL, preserve the origin
        if (basePath.match(/^https?:\/\//)) {
            try {
                // Use URL API to properly parse and join
                const baseUrl = new URL(basePath);
                return `${baseUrl.protocol}//${baseUrl.host}${relativePath}`;
            } catch (e) {
                // Fallback to basic joining if URL parsing fails
                const origin = basePath.split('/').slice(0, 3).join('/');
                return `${origin}${relativePath}`;
            }
        }
        return relativePath;
    }

    // Handle URLs in relativePath
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }

    // Handle URLs in basePath
    if (basePath.match(/^https?:\/\//)) {
        // Ensure base path ends with slash for proper joining
        const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
        return normalizedBase + relativePath;
    }

    // Ensure base path ends with slash if it's not empty
    const normalizedBase = basePath ?
        (basePath.endsWith('/') ? basePath : basePath + '/') : '';

    // Join and normalize
    return normalizePath(normalizedBase + relativePath);
}

/**
 * Gets the filename part of a path
 * @param path The full path
 * @returns The filename without the directory part
 */
export function getFilename(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return path; // No directory part, return the whole path
    }

    return path.substring(lastSlashIndex + 1);
}