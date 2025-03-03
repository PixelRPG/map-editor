import Gio from '@girs/gio-2.0';
import GLib from '@girs/glib-2.0';

/**
 * Load a text file from the filesystem or GResource
 * @param path Path to the file
 * @param useGResource Whether to load from GResource
 * @param resourcePrefix GResource prefix
 * @returns The file contents as a string
 */
export async function loadTextFile(
    path: string,
    useGResource = false,
    resourcePrefix = '/org/pixelrpg/game'
): Promise<string> {
    let file: Gio.File;

    if (useGResource) {
        // Load from GResource
        const resourcePath = path.startsWith('/')
            ? path
            : `${resourcePrefix}/${path}`;
        file = Gio.File.new_for_uri(`resource://${resourcePath}`);
    } else {
        // Load from filesystem
        file = Gio.File.new_for_path(path);
    }

    const [success, contents] = await new Promise<[boolean, Uint8Array]>((resolve) => {
        file.load_contents_async(null, (_, result) => {
            try {
                const [success, contents] = file.load_contents_finish(result);
                resolve([success, contents]);
            } catch (error) {
                console.error(`Error loading file: ${error}`);
                resolve([false, new Uint8Array()]);
            }
        });
    });

    if (!success) {
        throw new Error(`Failed to load file: ${path}`);
    }

    const decoder = new TextDecoder('utf-8');
    return decoder.decode(contents);
}

/**
 * Save a text file to the filesystem
 * @param path Path to save the file
 * @param content Content to save
 * @returns Promise that resolves when the file is saved
 */
export async function saveTextFile(path: string, content: string): Promise<void> {
    const file = Gio.File.new_for_path(path);
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    await new Promise<void>((resolve, reject) => {
        file.replace_contents_async(
            data,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (_, result) => {
                try {
                    file.replace_contents_finish(result);
                    resolve();
                } catch (error) {
                    console.error(`Error saving file: ${error}`);
                    reject(error);
                }
            }
        );
    });
}

/**
 * Get the user's config directory for the application
 * @param appName Application name
 * @returns Path to the config directory
 */
export function getUserConfigDir(appName: string): string {
    const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), appName]);

    // Create the directory if it doesn't exist
    const dir = Gio.File.new_for_path(configDir);
    if (!dir.query_exists(null)) {
        try {
            dir.make_directory_with_parents(null);
        } catch (error) {
            console.error(`Error creating config directory: ${error}`);
        }
    }

    return configDir;
}

/**
 * Get the user's data directory for the application
 * @param appName Application name
 * @returns Path to the data directory
 */
export function getUserDataDir(appName: string): string {
    const dataDir = GLib.build_filenamev([GLib.get_user_data_dir(), appName]);

    // Create the directory if it doesn't exist
    const dir = Gio.File.new_for_path(dataDir);
    if (!dir.query_exists(null)) {
        try {
            dir.make_directory_with_parents(null);
        } catch (error) {
            console.error(`Error creating data directory: ${error}`);
        }
    }

    return dataDir;
} 