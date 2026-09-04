import type { CharacterDefinition } from '@pixelrpg/engine'
import {
  CharacterPreview,
  type GalleryCardItem,
  type GdkSpriteSetResource,
  type SpriteSetChoice,
  TileGridThumbnail,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { isBuiltInSpriteSet } from '../../services/tiles-view-model.ts'

/**
 * Card models + preview widgets for the Sheets galleries. Split from the
 * view so the widget class only decides WHICH card to show, not how one
 * reads.
 */

/** Appearance card preview edge length (px) — matches the Cast cards. */
export const CARD_PREVIEW_SIZE = 160

/** What a tileset card states about its sprite-set. */
export interface TilesetCardFacts {
  id: string
  name: string
  spriteCount: number
  spriteWidth: number
  spriteHeight: number
  mapUsers: number
}

export function tileCountLabel(count: number): string {
  return count === 1 ? _('1 tile') : _(`${count} tiles`)
}

export function animationCountLabel(count: number): string {
  return count === 1 ? _('1 animation') : _(`${count} animations`)
}

/**
 * Card model for one tileset: the sprite count, tile dimensions and map
 * usage as one subtitle line, a tile-size chip as badge, and edit
 * affordances only for project sets — built-ins have no files and can be
 * neither renamed nor removed.
 */
export function buildTilesetCard(facts: TilesetCardFacts): GalleryCardItem {
  const parts = [tileCountLabel(facts.spriteCount)]
  if (facts.spriteWidth && facts.spriteHeight) parts.push(`${facts.spriteWidth}×${facts.spriteHeight}`)
  parts.push(facts.mapUsers === 1 ? _('used by 1 map') : _(`used by ${facts.mapUsers} maps`))
  const editable = !isBuiltInSpriteSet(facts.id)
  return {
    id: facts.id,
    title: facts.name,
    subtitle: parts.join(' · '),
    badge: facts.spriteWidth ? _(`${facts.spriteWidth}px tiles`) : null,
    fallbackIcon: 'view-grid-symbolic',
    deletable: editable,
    renamable: editable,
  }
}

/**
 * Representative tile-grid excerpt for a tileset card — the recognisable
 * mosaic, far more useful than any single tile (often an empty eraser cell).
 */
export function buildTilesetPreview(spriteSet: GdkSpriteSetResource | null, columns: number): TileGridThumbnail | null {
  if (!spriteSet) return null
  const thumb = new TileGridThumbnail()
  thumb.setSpriteSet(spriteSet, columns)
  return thumb
}

/** Card model for one appearance sheet: animation count as subtitle. */
export function buildAppearanceCard(sheet: SpriteSetChoice, animationCount: number): GalleryCardItem {
  return {
    id: sheet.id,
    title: sheet.name,
    subtitle: animationCountLabel(animationCount),
    fallbackIcon: 'image-x-generic-symbolic',
    deletable: true,
  }
}

/** Showcase preview for an appearance card (a synthetic character bound to the sheet). */
export function buildAppearancePreview(
  character: CharacterDefinition | null,
  spriteSet: GdkSpriteSetResource | null,
): CharacterPreview | null {
  if (!character) return null
  const preview = new CharacterPreview()
  preview.showControls = false
  preview.autoCycle = true
  preview.frameSize = CARD_PREVIEW_SIZE
  preview.highlighted = false
  preview.setCharacter(character, spriteSet)
  return preview
}
