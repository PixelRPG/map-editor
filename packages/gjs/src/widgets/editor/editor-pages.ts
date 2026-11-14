import type Adw from '@girs/adw-1'

import { BrushPage } from './brush-page.ts'
import { LayersPage } from './layers-page.ts'
import { SelectedPage } from './selected-page.ts'

/**
 * The three `Adw.Bin`s one layout offers as homes for the editor pages.
 *
 * `RightInspector` exposes one set, `SceneEditor`'s bottom sheet another;
 * only ever one of them holds the pages.
 */
export interface PageSlots {
  brush: Adw.Bin
  layers: Adw.Bin
  selected: Adw.Bin
}

/**
 * The editor's three pages — Brush, Layers, Selected — as ONE set of
 * widget instances that moves between layouts.
 *
 * The wide layout shows them in the right inspector, the phone layout in
 * the bottom sheet. Building a copy per layout is what makes "the layer
 * list is stale on phone" bugs: every host write would have to find both
 * copies. Instead the host keeps one set and re-parents it on layout
 * change via {@link EditorPages.host}, so every populate call has exactly
 * one target.
 *
 * Deliberately not a GObject: it owns widgets, it is not one.
 */
export class EditorPages {
  readonly brush = new BrushPage()
  readonly layers = new LayersPage()
  readonly selected = new SelectedPage()

  private _slots: PageSlots | null = null

  /** The slot set currently holding the pages, `null` while unhosted. */
  get slots(): PageSlots | null {
    return this._slots
  }

  /**
   * Move all three pages into `slots`, or unparent them with `null`.
   *
   * Clearing the previous slots first is what keeps a page from being
   * added to a second parent while it still has one — GTK warns and
   * drops the add, leaving an invisible page.
   */
  host(slots: PageSlots | null): void {
    if (this._slots === slots) return
    if (this._slots) {
      this._slots.brush.set_child(null)
      this._slots.layers.set_child(null)
      this._slots.selected.set_child(null)
    }
    this._slots = slots
    if (!slots) return
    slots.brush.set_child(this.brush)
    slots.layers.set_child(this.layers)
    slots.selected.set_child(this.selected)
  }
}
