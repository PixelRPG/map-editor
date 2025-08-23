import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import { SpriteWidget } from './sprite.widget'
import { SpriteSheet } from '@pixelrpg/data-gjs'

import Template from './sprite-sheet.widget.blp'

/**
 * Widget for displaying a sprite sheet as a grid of sprites
 */
export class SpriteSheetWidget extends Gtk.ScrolledWindow {
  // GObject properties
  declare spriteSheet: SpriteSheet
  declare scale: number
  declare showGrid: boolean
  declare maxColumns: number

  // GObject internal children
  declare _flowBox: Gtk.FlowBox

  // Signal management
  private _signalHandlers: number[] = []

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteSheetWidget',
        Template,
        InternalChildren: ['flowBox'],
        Properties: {
          scale: GObject.ParamSpec.double(
            'scale',
            'Scale',
            'Scale factor for sprites',
            GObject.ParamFlags.READWRITE,
            0.25,
            4.0,
            1.0, // min, max, default
          ),
          showGrid: GObject.ParamSpec.boolean(
            'showGrid',
            'Show Grid',
            'Show grid lines between sprites',
            GObject.ParamFlags.READWRITE,
            true, // default
          ),
          maxColumns: GObject.ParamSpec.int(
            'maxColumns',
            'Max Columns',
            'Maximum number of columns to display',
            GObject.ParamFlags.READWRITE,
            4,
            32,
            16, // min, max, default
          ),
        },
      },
      this,
    )
  }
  constructor(
    spriteSheet: SpriteSheet,
    options: { scale?: number; showGrid?: boolean; maxColumns?: number } = {},
  ) {
    // Layout properties are configured in the Blueprint template
    super()

    this.spriteSheet = spriteSheet
    this.scale = options.scale ?? 1.0
    this.showGrid = options.showGrid ?? true
    this.maxColumns = options.maxColumns ?? 16
    this.onSelected = this.onSelected.bind(this)

    this._populateSprites()
    this._applyProperties()
  }

  /**
   * Populate the flow box with sprite widgets
   */
  private _populateSprites(): void {
    // Clear existing children
    this._flowBox.remove_all()

    // Add sprites with current scale
    for (const sprite of this.spriteSheet.sprites) {
      const spriteWidget = new SpriteWidget(sprite, this.scale)
      this._flowBox.append(spriteWidget)
    }
  }

  /**
   * Apply current properties to the widget
   */
  private _applyProperties(): void {
    // Apply max columns
    this._flowBox.set_max_children_per_line(this.maxColumns)

    // Apply grid spacing based on showGrid
    if (this.showGrid) {
      this._flowBox.set_row_spacing(1)
      this._flowBox.set_column_spacing(1)
    } else {
      this._flowBox.set_row_spacing(0)
      this._flowBox.set_column_spacing(0)
    }
  }

  /**
   * Update scale for all sprite widgets
   */
  updateScale(newScale: number): void {
    this.scale = newScale

    // Update scale on existing SpriteWidgets using clean API
    let child = this._flowBox.get_first_child()
    while (child) {
      if (child instanceof Gtk.FlowBoxChild) {
        const spriteWidget = child.child as SpriteWidget
        if (spriteWidget) {
          spriteWidget.scale = newScale
        }
      }
      child = child.get_next_sibling()
    }
  }

  /**
   * Update show grid setting
   */
  updateShowGrid(showGrid: boolean): void {
    this.showGrid = showGrid
    this._applyProperties()
  }

  /**
   * Update max columns setting
   */
  updateMaxColumns(maxColumns: number): void {
    this.maxColumns = maxColumns
    this._applyProperties()
  }

  onSelected(parent: Gtk.FlowBox, flowBoxChild: Gtk.FlowBoxChild) {
    const spriteWidget = flowBoxChild.child as SpriteWidget
    const sprite = spriteWidget.sprite
    console.log('Selected sprite:', sprite)
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect child-activated signal
      const handlerId = this._flowBox.connect(
        'child-activated',
        this.onSelected,
      )
      this._signalHandlers.push(handlerId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers
      for (const handlerId of this._signalHandlers) {
        if (handlerId > 0) {
          this._flowBox.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(SpriteSheetWidget.$gtype)
