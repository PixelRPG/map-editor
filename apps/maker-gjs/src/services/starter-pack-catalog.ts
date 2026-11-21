import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'

import { parseStarterPacks, type StarterPack } from './starter-packs.ts'
import { TEMPLATES_ROOT } from './templates.ts'

/** A pack plus where its files are and the picture its card shows. */
export interface StarterPackEntry {
  pack: StarterPack
  /** Absolute path of the sprite-set descriptor the pack copies. */
  descriptorPath: string
  /** The whole sheet, or `null` when its image cannot be read. */
  preview: Gdk.Texture | null
}

function readJson(path: string): unknown {
  try {
    const [ok, bytes] = GLib.file_get_contents(path)
    return ok ? JSON.parse(new TextDecoder().decode(bytes)) : null
  } catch {
    return null
  }
}

function loadPreview(descriptorPath: string): Gdk.Texture | null {
  const imageFile = (readJson(descriptorPath) as { image?: { path?: unknown } } | null)?.image?.path
  if (typeof imageFile !== 'string') return null
  try {
    return Gdk.Texture.new_from_filename(GLib.build_filenamev([GLib.path_get_dirname(descriptorPath), imageFile]))
  } catch {
    return null
  }
}

let catalog: readonly StarterPackEntry[] | undefined

/**
 * The packs the app offers, read once, read from `games/starter-packs.json`. A
 * missing or broken catalogue is an empty shelf, never an error: the
 * shelf hides until a pack exists.
 */
export function loadStarterPacks(): readonly StarterPackEntry[] {
  catalog ??= parseStarterPacks(readJson(`${TEMPLATES_ROOT}/starter-packs.json`)).map((pack) => {
    const descriptorPath = `${TEMPLATES_ROOT}/${pack.spriteSet}`
    return { pack, descriptorPath, preview: loadPreview(descriptorPath) }
  })
  return catalog
}
