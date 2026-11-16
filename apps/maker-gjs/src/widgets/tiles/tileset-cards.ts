import type { CharacterDefinition } from '@pixelrpg/engine'
import {
  CharacterPreview,
  type GalleryCardItem,
  type GdkSpriteSetResource,
  SheetThumbnail,
  type SpriteSetChoice,
} from '@pixelrpg/gjs'
import { gettext as _, ngettext } from 'gettext'

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
  return ngettext('%d tile', '%d tiles', count).replace('%d', String(count))
}

export function animationCountLabel(count: number): string {
  return ngettext('%d animation', '%d animations', count).replace('%d', String(count))
}

/** The card's usage line — the sort key of the "Usage" order, so it stays on the card. */
export function mapUsageLabel(mapUsers: number): string {
  if (mapUsers === 0) return _('Not used by any map')
  return ngettext('Used by %d map', 'Used by %d maps', mapUsers).replace('%d', String(mapUsers))
}

/**
 * Card model for one tileset: sprite count and tile size on the
 * subtitle line, map usage on a line of its own (the three together
 * outgrow a card's width and got cut off), and edit affordances only
 * for project sets — built-ins have no files and can be neither renamed
 * nor removed. No badge: the tile size is already on the subtitle.
 */
export function buildTilesetCard(facts: TilesetCardFacts): GalleryCardItem {
  const parts = [tileCountLabel(facts.spriteCount)]
  if (facts.spriteWidth && facts.spriteHeight) parts.push(`${facts.spriteWidth}×${facts.spriteHeight}`)
  const editable = !isBuiltInSpriteSet(facts.id)
  return {
    id: facts.id,
    title: facts.name,
    subtitle: parts.join(' · '),
    detail: mapUsageLabel(facts.mapUsers),
    fallbackIcon: 'view-grid-symbolic',
    deletable: editable,
    renamable: editable,
  }
}

/**
 * The tileset's own sheet, whole and scaled to fit the card (§ 4.4) —
 * the recognisable mosaic, where a single tile is often an empty eraser
 * cell and a cropped corner said nothing about the rest of the file.
 * `null` when there is no image to show, so the card falls back to its
 * symbolic icon instead of a blank square.
 */
export function buildTilesetPreview(spriteSet: GdkSpriteSetResource | null): SheetThumbnail | null {
  const texture = spriteSet?.imageTexture?.texture
  if (!texture) return null
  const thumb = new SheetThumbnail({ width: CARD_PREVIEW_SIZE })
  thumb.setSheet(texture)
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
