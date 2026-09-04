import GLib from '@girs/glib-2.0'
import { type GameProjectData, GameProjectFormat, type SpriteSetData, SpriteSetFormat } from '@pixelrpg/engine'
import { copyFile, deleteFile, readBinaryFile, writeBinaryFile, writeTextFile } from './file-io.ts'

/**
 * The disk half of `ProjectStore`: path construction plus the two
 * serialise-and-write pairs (`game-project.json`,
 * `spritesets/<id>.json`). Kept apart from the store so the write
 * policy — best-effort, in-memory state stays authoritative, a failure
 * reports `false` and the caller decides whether to toast — lives in
 * one readable place.
 */

/** Injectable file-IO seam (defaults to the shared Gio helpers) so specs can record writes. */
export interface ProjectStoreIo {
  writeText: typeof writeTextFile
  writeBinary: typeof writeBinaryFile
  copy: typeof copyFile
  readBinary: typeof readBinaryFile
  remove: typeof deleteFile
}

/** The real Gio-backed IO the store uses outside tests. */
export const DEFAULT_PROJECT_STORE_IO: ProjectStoreIo = {
  writeText: writeTextFile,
  writeBinary: writeBinaryFile,
  copy: copyFile,
  readBinary: readBinaryFile,
  remove: deleteFile,
}

/**
 * True when `name` is a plain single-path-segment filename — no path
 * separators, no `..`, no NUL. Used to vet a peer-supplied sprite-set
 * id before it's used to build filesystem paths, so a malicious peer
 * can't write outside the project's `spritesets/` directory.
 */
export function isPlainFilename(name: string): boolean {
  return name.length > 0 && !/[\\/]/.test(name) && !name.includes('..') && !name.includes('\0')
}

/** The three filenames a project sprite set owns. */
export interface SpriteSetPaths {
  /** Descriptor-relative image filename (`<id>.png`) — what `data.image.path` carries. */
  imageFile: string
  /** Absolute path of `spritesets/<id>.png`. */
  image: string
  /** Absolute path of `spritesets/<id>.json`. */
  descriptor: string
}

/**
 * Locate a sprite set's files next to the project's `game-project.json`.
 * Callers that pass a PEER-supplied id must gate on
 * {@link isPlainFilename} first — this builder does not validate.
 */
export function spriteSetPaths(projectPath: string, id: string): SpriteSetPaths {
  const spriteSetDir = GLib.build_filenamev([GLib.path_get_dirname(projectPath), 'spritesets'])
  const imageFile = `${id}.png`
  return {
    imageFile,
    image: GLib.build_filenamev([spriteSetDir, imageFile]),
    descriptor: GLib.build_filenamev([spriteSetDir, `${id}.json`]),
  }
}

/**
 * Serialise the in-memory `GameProjectData` back to disk. Returns
 * `false` when the write failed or the data did not survive the
 * format's validation — the caller toasts; the in-memory state stays
 * as it is so the UI doesn't snap back to old values.
 */
export function writeProjectData(io: ProjectStoreIo, projectPath: string, data: GameProjectData): boolean {
  try {
    return io.writeText(projectPath, GameProjectFormat.serialize(data))
  } catch (err) {
    console.warn('[ProjectStore] Failed to persist project:', err)
    return false
  }
}

/** Serialise a sprite set's descriptor back to `spritesets/<id>.json`. */
export function writeSpriteSetDescriptor(io: ProjectStoreIo, descriptorPath: string, data: SpriteSetData): boolean {
  return io.writeText(descriptorPath, SpriteSetFormat.serialize(data))
}

/**
 * Delete a project sprite set's `<id>.png` + `<id>.json`. Best-effort —
 * a failed delete doesn't abort the in-memory removal (the reference is
 * gone either way; an orphaned file is harmless).
 */
export function deleteSpriteSetFiles(io: ProjectStoreIo, paths: SpriteSetPaths): void {
  io.remove(paths.image)
  io.remove(paths.descriptor)
}
