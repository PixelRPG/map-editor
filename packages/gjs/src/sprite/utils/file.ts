import Gio from '@girs/gio-2.0'

/**
 * Load a text file from the local filesystem via Gio.
 *
 * For cross-platform loading (browser + GJS) prefer `@pixelrpg/engine`'s
 * `loadTextFile`, which uses `fetch` and works in both runtimes. This helper
 * is kept only for GJS code paths that need direct Gio access (e.g. to write
 * files via {@link saveTextFile}).
 */
export async function loadTextFile(path: string): Promise<string> {
    const file = Gio.File.new_for_path(path)

    const [success, contents] = await new Promise<[boolean, Uint8Array]>((resolve) => {
        file.load_contents_async(null, (_, result) => {
            try {
                const [success, contents] = file.load_contents_finish(result)
                resolve([success, contents])
            } catch (error) {
                console.error(`Error loading file: ${error}`)
                resolve([false, new Uint8Array()])
            }
        })
    })

    if (!success) {
        throw new Error(`Failed to load file: ${path}`)
    }

    const decoder = new TextDecoder('utf-8')
    return decoder.decode(contents)
}

export async function loadJsonFile<T>(path: string): Promise<T> {
    const content = await loadTextFile(path)
    return JSON.parse(content) as T
}

export async function saveTextFile(path: string, content: string): Promise<void> {
    const file = Gio.File.new_for_path(path)
    const encoder = new TextEncoder()
    const data = encoder.encode(content)

    await new Promise<void>((resolve, reject) => {
        file.replace_contents_async(
            data,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
            (_, result) => {
                try {
                    file.replace_contents_finish(result)
                    resolve()
                } catch (error) {
                    console.error(`Error saving file: ${error}`)
                    reject(error)
                }
            },
        )
    })
}

export async function saveJsonFile<T>(path: string, data: T): Promise<void> {
    const content = JSON.stringify(data, null, 2)
    await saveTextFile(path, content)
}
