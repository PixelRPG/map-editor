import type { SpriteSetData } from './data/SpriteSetData.ts'

/**
 * Read-only sprite-by-id access shared by Excalibur and Gdk sprite resources.
 *
 * Both `SpriteSetResource` (Excalibur) and `GdkSpriteSetResource` (GTK) satisfy
 * this shape via structural typing. Use this in cross-platform engine services
 * that consume sprite-set resources without binding to a specific runtime.
 */
export interface SpriteIndex<TSprite = unknown> {
  readonly sprites: Readonly<Record<number, TSprite>>
  readonly data: SpriteSetData
}
