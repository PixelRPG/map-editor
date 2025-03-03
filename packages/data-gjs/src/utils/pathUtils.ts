/**
 * Path utilities for GJS implementation
 * Provides file path manipulation utilities for use in GTK applications
 */

import GLib from '@girs/glib-2.0';

/**
 * Extracts the directory path from a file path
 * @param filePath The full file path
 * @returns The directory path
 */
export function extractDirectoryPath(filePath: string): string {
    if (!filePath) return '';

    // Use GLib's path utilities to get the directory name
    return GLib.path_get_dirname(filePath);
}

/**
 * Join path segments into a single path
 * @param basePath The base path
 * @param segments Additional path segments to join
 * @returns The joined path
 */
export function joinPaths(basePath: string, ...segments: string[]): string {
    if (!basePath) return segments.join(GLib.DIR_SEPARATOR_S);

    // Start with the base path
    let result = basePath;

    // Add each segment, ensuring proper separators
    for (const segment of segments) {
        if (!segment) continue;

        // If the base path doesn't end with a separator and the segment doesn't start with one
        if (!result.endsWith(GLib.DIR_SEPARATOR_S) && !segment.startsWith(GLib.DIR_SEPARATOR_S)) {
            result += GLib.DIR_SEPARATOR_S;
        }

        // If both have separators, trim one
        if (result.endsWith(GLib.DIR_SEPARATOR_S) && segment.startsWith(GLib.DIR_SEPARATOR_S)) {
            result += segment.substring(1);
        } else {
            result += segment;
        }
    }

    return result;
}

/**
 * Get the file name from a path
 * @param filePath The full file path
 * @returns The file name
 */
export function getFileName(filePath: string): string {
    if (!filePath) return '';

    return GLib.path_get_basename(filePath);
}

/**
 * Check if a path is absolute
 * @param path The path to check
 * @returns True if the path is absolute
 */
export function isAbsolutePath(path: string): boolean {
    if (!path) return false;

    return GLib.path_is_absolute(path);
}

/**
 * Get the file extension
 * @param filePath The file path
 * @returns The file extension (without the dot)
 */
export function getFileExtension(filePath: string): string {
    if (!filePath) return '';

    const fileName = getFileName(filePath);
    const lastDotIndex = fileName.lastIndexOf('.');

    if (lastDotIndex === -1) {
        return '';
    }

    return fileName.substring(lastDotIndex + 1);
}

/**
 * Check if a path has a specific extension
 * @param filePath The file path
 * @param extension The extension to check (without the dot)
 * @returns True if the file has the specified extension
 */
export function hasExtension(filePath: string, extension: string): boolean {
    if (!filePath || !extension) return false;

    const fileExt = getFileExtension(filePath);
    return fileExt.toLowerCase() === extension.toLowerCase();
} 