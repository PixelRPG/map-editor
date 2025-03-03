/**
 * File utilities for GJS implementation
 * Provides file loading and saving utilities for use in GTK applications
 */

import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';

/**
 * Result of a file load operation
 */
export interface FileLoadResult<T = any> {
    success: boolean;
    data?: T;
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
 * Loads a JSON file from the specified path
 * @param path Path to the JSON file
 * @returns Promise resolving to the parsed JSON data
 * @throws Error if the file cannot be loaded or parsed
 */
export async function loadJsonFile<T = any>(path: string): Promise<T> {
    const file = Gio.File.new_for_path(path);

    try {
        const [success, contents] = file.load_contents(null);

        if (!success) {
            throw new Error(`Failed to load file: ${path}`);
        }

        const decoder = new TextDecoder('utf-8');
        const jsonString = decoder.decode(contents);

        return JSON.parse(jsonString) as T;
    } catch (error) {
        console.error(`Error loading JSON file ${path}:`, error);
        throw error;
    }
}

/**
 * Saves data to a JSON file at the specified path
 * @param path Path to save the JSON file
 * @param data Data to save as JSON
 * @param pretty Whether to format the JSON with indentation (default: true)
 * @returns Promise resolving to a FileSaveResult
 */
export async function saveJsonFile(path: string, data: any, pretty: boolean = true): Promise<FileSaveResult> {
    const file = Gio.File.new_for_path(path);

    try {
        const jsonString = JSON.stringify(data, null, pretty ? 2 : 0);
        const bytes = GLib.Bytes.new(new TextEncoder().encode(jsonString));

        const [success] = await new Promise<[boolean]>((resolve) => {
            file.replace_contents_bytes_async(
                bytes,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null,
                (obj, res) => {
                    try {
                        const result = file.replace_contents_finish(res);
                        resolve([true]);
                    } catch (error) {
                        console.error('Error saving JSON file:', error);
                        resolve([false]);
                    }
                }
            );
        });

        return { success };
    } catch (error) {
        console.error(`Error saving JSON file ${path}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
} 