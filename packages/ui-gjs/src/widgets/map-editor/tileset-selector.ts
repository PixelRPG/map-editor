import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'

import { SpriteSheetWidget } from '../sprite/sprite-sheet.widget'
import { SpriteSheet } from '@pixelrpg/data-gjs'

import Template from './tileset-selector.blp'

/**
 * Container widget for displaying multiple tilesets vertically
 * Each tileset is displayed as a SpriteSheetWidget in a scrollable container
 */
export class TilesetSelector extends Adw.Bin {
  // Private fields for GObject properties
  private _tilesets: SpriteSheet[] = []
  private _scale: number = 2.0
  private _showGrid: boolean = true

  // Internal children from template
  declare _tilesets_container: Gtk.Box
  declare _placeholder_box: Gtk.Box

  // Track sprite sheet widgets for management
  private _spriteSheetWidgets: SpriteSheetWidget[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesetSelector',
        Template,
        InternalChildren: ['tilesets_container', 'placeholder_box'],
        Properties: {
          tilesets: GObject.ParamSpec.jsobject(
            'tilesets',
            'Tilesets',
            'Array of sprite sheets to display as tilesets',
            GObject.ParamFlags.READWRITE,
          ),
          scale: GObject.ParamSpec.double(
            'scale',
            'Sprite Scale',
            'Scale factor for all sprite sheets',
            GObject.ParamFlags.READWRITE,
            0.25,
            4.0,
            2.0, // min, max, default
          ),
          showGrid: GObject.ParamSpec.boolean(
            'showGrid',
            'Show Grid',
            'Show grid lines between sprites in all tilesets',
            GObject.ParamFlags.READWRITE,
            true, // default
          ),
        },
        Signals: {
          'sprite-selected': {
            param_types: [GObject.TYPE_JSOBJECT, GObject.TYPE_INT], // Sprite object, tileset index
          },
        },
      },
      this,
    )
  }

  constructor(params: Partial<Adw.Bin.ConstructorProps> = {}) {
    super(params)
    this._updateDisplay()
  }

  // GObject property getters and setters
  get tilesets(): SpriteSheet[] {
    return this._tilesets
  }

  set tilesets(value: SpriteSheet[]) {
    if (this._tilesets === value) return

    this._tilesets = value || []
    this.notify('tilesets')
    this._updateDisplay()
  }

  get scale(): number {
    return this._scale
  }

  set scale(value: number) {
    if (this._scale === value) return

    this._scale = value
    this.notify('scale')
    this._updateScale()
  }

  get showGrid(): boolean {
    return this._showGrid
  }

  set showGrid(value: boolean) {
    if (this._showGrid === value) return

    this._showGrid = value
    this.notify('showGrid')
    this._updateShowGrid()
  }

  /**
   * Add a single tileset to the container
   * @param spriteSheet The sprite sheet to add as a tileset
   * @param name Optional name for the tileset section
   */
  addTileset(spriteSheet: SpriteSheet, name?: string): void {
    this._tilesets.push(spriteSheet)
    this.notify('tilesets')
    this._addSpriteSheetWidget(spriteSheet, this._tilesets.length - 1, name)
    this._updatePlaceholderVisibility()
  }

  /**
   * Remove a tileset by index
   * @param index The index of the tileset to remove
   */
  removeTileset(index: number): void {
    if (index < 0 || index >= this._tilesets.length) return

    this._tilesets.splice(index, 1)
    this.notify('tilesets')

    // Remove corresponding widget
    if (this._spriteSheetWidgets[index]) {
      this._tilesets_container.remove(this._spriteSheetWidgets[index])
      this._spriteSheetWidgets.splice(index, 1)
    }

    this._updatePlaceholderVisibility()
  }

  /**
   * Clear all tilesets
   */
  clearTilesets(): void {
    this._tilesets = []
    this.notify('tilesets')
    this._clearSpriteSheetWidgets()
    this._updatePlaceholderVisibility()
  }

  /**
   * Update the display when tilesets change
   */
  private _updateDisplay(): void {
    this._clearSpriteSheetWidgets()

    this._tilesets.forEach((spriteSheet, index) => {
      this._addSpriteSheetWidget(spriteSheet, index)
    })

    this._updatePlaceholderVisibility()
  }

  /**
   * Add a sprite sheet widget to the container
   */
  private _addSpriteSheetWidget(
    spriteSheet: SpriteSheet,
    index: number,
    name?: string,
  ): void {
    const spriteSheetWidget = new SpriteSheetWidget(spriteSheet, {
      scale: this._scale,
      showGrid: this._showGrid,
      maxColumns: 16, // Default max columns for tilesets
    })

    // Connect sprite selection signal
    spriteSheetWidget.connect('sprite-selected', (widget, sprite) => {
      this.emit('sprite-selected', sprite, index)
    })

    // Create a section container with optional title
    const section = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 0,
      marginBottom: 0,
    })

    // Add a title label if a name is provided
    if (name) {
      const titleLabel = new Gtk.Label({
        label: name,
        xalign: 0,
      })
      titleLabel.add_css_class('heading')
      section.append(titleLabel)
    }

    // Add the sprite sheet widget
    section.append(spriteSheetWidget)

    this._tilesets_container.append(section)
    this._spriteSheetWidgets.push(spriteSheetWidget)
  }

  /**
   * Clear all sprite sheet widgets
   */
  private _clearSpriteSheetWidgets(): void {
    // Remove all children from container
    let child = this._tilesets_container.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._tilesets_container.remove(child)
      child = next
    }
    this._spriteSheetWidgets = []
  }

  /**
   * Update sprite scale for all widgets
   */
  private _updateScale(): void {
    this._spriteSheetWidgets.forEach((widget) => {
      widget.updateScale(this._scale)
    })
  }

  /**
   * Update show grid for all widgets
   */
  private _updateShowGrid(): void {
    this._spriteSheetWidgets.forEach((widget) => {
      widget.updateShowGrid(this._showGrid)
    })
  }

  /**
   * Show/hide placeholder based on whether we have tilesets
   */
  private _updatePlaceholderVisibility(): void {
    const hasContent = this._tilesets.length > 0
    this._placeholder_box.set_visible(!hasContent)
  }

  /**
   * Get the currently selected sprite from any tileset
   * @returns Object with sprite and tileset index, or null if none selected
   */
  getSelectedSprite(): { sprite: any; tilesetIndex: number } | null {
    for (let i = 0; i < this._spriteSheetWidgets.length; i++) {
      const sprite = this._spriteSheetWidgets[i].getSelectedSprite()
      if (sprite) {
        return { sprite, tilesetIndex: i }
      }
    }
    return null
  }

  /**
   * Clear selection in all tilesets
   */
  clearSelection(): void {
    this._spriteSheetWidgets.forEach((widget) => {
      widget.clearSelection()
    })
  }
}

GObject.type_ensure(TilesetSelector.$gtype)
