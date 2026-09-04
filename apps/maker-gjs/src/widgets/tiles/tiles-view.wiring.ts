import type Gtk from '@girs/gtk-4.0'
import type { CardGallery, SignalScope, TileInspector, TilePalette } from '@pixelrpg/gjs'

import { type TilesetSort, tilesetSortAtIndex } from '../../services/tiles-view-model.ts'

/**
 * Signal wiring for the Sheets view, split by the surface each group
 * belongs to. Every function takes only the widgets it connects plus the
 * handful of actions it can trigger — a helper handed the whole view would
 * have moved the code without loosening the coupling.
 *
 * All of them connect through the caller's {@link SignalScope}, so the
 * view's `vfunc_unmap` still releases everything in one `disconnectAll()`.
 */

/** What the tileset cards can ask the view to do. */
export interface TilesetGalleryActions {
  select(id: string): void
  openDetail(): void
  requestRename(id: string): void
  requestReorder(draggedId: string, targetId: string): void
  requestDelete(id: string): void
}

export function wireTilesetGallery(scope: SignalScope, gallery: CardGallery, actions: TilesetGalleryActions): void {
  scope.connect(gallery, 'item-activated', (_g: CardGallery, id: string) => {
    actions.select(id)
  })
  scope.connect(gallery, 'item-opened', (_g: CardGallery, id: string) => {
    actions.select(id)
    actions.openDetail()
  })
  scope.connect(gallery, 'rename-requested', (_g: CardGallery, id: string) => {
    actions.requestRename(id)
  })
  scope.connect(gallery, 'reorder-requested', (_g: CardGallery, draggedId: string, targetId: string) => {
    actions.requestReorder(draggedId, targetId)
  })
  scope.connect(gallery, 'delete-requested', (_g: CardGallery, id: string) => {
    actions.requestDelete(id)
  })
}

/**
 * What the appearance cards can ask the view to do. Appearances are raw
 * assets here — authoring their animations happens in the Cast matrix, so
 * "open" is a jump rather than a drill-down.
 */
export interface AppearanceGalleryActions {
  select(id: string): void
  editInCast(id: string): void
  requestDelete(id: string): void
}

export function wireAppearanceGallery(
  scope: SignalScope,
  gallery: CardGallery,
  actions: AppearanceGalleryActions,
): void {
  scope.connect(gallery, 'item-activated', (_g: CardGallery, id: string) => {
    actions.select(id)
  })
  scope.connect(gallery, 'item-opened', (_g: CardGallery, id: string) => {
    actions.select(id)
    actions.editInCast(id)
  })
  scope.connect(gallery, 'delete-requested', (_g: CardGallery, id: string) => {
    actions.requestDelete(id)
  })
}

/** The search entry + sort dropdown above the galleries. */
export interface GalleryQueryControls {
  searchEntry: Gtk.SearchEntry
  sortDropdown: Gtk.DropDown
}

export interface GalleryQueryActions {
  setSearch(search: string): void
  setSort(sort: TilesetSort): void
}

export function wireGalleryQuery(
  scope: SignalScope,
  controls: GalleryQueryControls,
  actions: GalleryQueryActions,
): void {
  scope.connect(controls.searchEntry, 'search-changed', () => {
    actions.setSearch(controls.searchEntry.get_text())
  })
  scope.connect(controls.sortDropdown, 'notify::selected', () => {
    actions.setSort(tilesetSortAtIndex(controls.sortDropdown.get_selected()))
  })
}

/** The tileset detail page: the palette, its inspector, and the phone sheet's close button. */
export interface TileEditingWidgets {
  palette: TilePalette
  inspector: TileInspector
  sheetClose: Gtk.Button
}

export interface TileEditingActions {
  selectTile(tileId: number): void
  clearTileSelection(): void
  setSolid(solid: boolean): void
  setSurface(surface: string | null): void
}

export function wireTileEditing(scope: SignalScope, widgets: TileEditingWidgets, actions: TileEditingActions): void {
  scope.connect(widgets.palette, 'tile-selected', (_p: TilePalette, tileId: number) => {
    actions.selectTile(tileId)
  })
  scope.connect(widgets.sheetClose, 'clicked', () => {
    actions.clearTileSelection()
  })
  scope.connect(widgets.inspector, 'solid-changed', (_i: TileInspector, solid: boolean) => {
    actions.setSolid(solid)
  })
  // The inspector reports "no surface" as an empty string; the project data
  // records it as null.
  scope.connect(widgets.inspector, 'surface-changed', (_i: TileInspector, surface: string) => {
    actions.setSurface(surface === '' ? null : surface)
  })
}
