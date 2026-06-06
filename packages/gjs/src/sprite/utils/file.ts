import Gio from '@girs/gio-2.0'

/**
 * Load a text file from the local filesystem via Gio.
 *
 * For cross-platform loading (browser + GJS) prefer `@pixelrpg/engine`'s
 * `loadTextFile`, which uses `fetch` and works in both runtimes. This helper
 * is kept only for GJS code paths that need direct Gio access.
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
