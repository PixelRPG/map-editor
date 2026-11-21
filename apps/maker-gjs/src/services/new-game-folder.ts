/**
 * Where "New game" puts a game when nobody picked a folder: one named
 * folder per game under `<base>/PixelRPG`, numbered when the name is taken.
 * Pure (the caller supplies the filesystem question) so it runs under node.
 */

/** Folder that groups every game the maker created, inside Documents. */
export const GAMES_FOLDER = 'PixelRPG'

/** A folder name from a (translated) display name: no path separators, never empty. */
export function folderNameFor(displayName: string): string {
  const cleaned = displayName
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.replace(/^\.+/, '').trim() || 'Game'
}

/**
 * `<base>/PixelRPG/<name>`, or `<name> 2`, `<name> 3`, … until `taken`
 * says the path is free.
 */
export function nextFreeGameDir(base: string, displayName: string, taken: (path: string) => boolean): string {
  const root = `${base.replace(/\/+$/, '')}/${GAMES_FOLDER}`
  const name = folderNameFor(displayName)
  let candidate = `${root}/${name}`
  for (let n = 2; taken(candidate); n++) candidate = `${root}/${name} ${n}`
  return candidate
}
