/**
 * Common utility functions for file operations
 * Platform-specific implementations will need to provide their own implementations
 * but can follow these interfaces
 */

/**
 * Result of a file load operation
 */
export interface FileLoadResult {
    success: boolean;
    content?: string;
    error?: Error;
}

/**
 * Result of a file save operation
 */
export interface FileSaveResult {
    success: boolean;
    error?: Error;
}

/**
 * Extracts the directory path from a file path
 * @param path The file path
 * @returns The directory path
 */
export function extractDirectoryPath(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return '';
    }
    return path.substring(0, lastSlashIndex);
}

/**
 * Gets the filename from a file path
 * @param path The file path
 * @returns The filename
 */
export function getFilename(path: string): string {
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex === -1) {
        return path;
    }
    return path.substring(lastSlashIndex + 1);
}

/**
 * Joins path segments
 * @param paths Path segments to join
 * @returns The joined path
 */
export function joinPaths(...paths: string[]): string {
    return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
} 