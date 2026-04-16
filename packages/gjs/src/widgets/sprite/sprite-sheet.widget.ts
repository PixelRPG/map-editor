import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import { SpriteWidget } from './sprite.widget'
import { SpriteSheet, Sprite } from '../../sprite'

import Template from './sprite-sheet.widget.blp'

/**
 * Widget for displaying a sprite sheet as a grid of sprites
 */
export class SpriteSheetWidget extends Gtk.ScrolledWindow {
  // Private fields for GObject properties
  private _spriteSheet: SpriteSheet | null = null
  private _scale: number = 1.0
  private _showGrid: boolean = true
  private _maxColumns: number = 16

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
          spriteSheet: GObject.ParamSpec.jsobject(
            'spriteSheet',
            'Sprite Sheet',
            'The sprite sheet to display',
            GObject.ParamFlags.READWRITE,
          ),
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
            64,
            16, // min, max, default
          ),
        },
        Signals: {
          'sprite-selected': {
            param_types: [GObject.TYPE_JSOBJECT], // Sprite object
          },
        },
      },
      this,
    )
  }
  constructor(
    spriteSheet?: SpriteSheet,
    options: { scale?: number; showGrid?: boolean; maxColumns?: number } = {},
  ) {
    // Layout properties are configured in the Blueprint template
    super()

    // Set properties first before setting sprite sheet
    if (options.scale !== undefined) {
      this._scale = options.scale
    }
    if (options.showGrid !== undefined) {
      this._showGrid = options.showGrid
    }
    if (options.maxColumns !== undefined) {
      this._maxColumns = options.maxColumns
    }
    this.onSelected = this.onSelected.bind(this)

    if (spriteSheet) {
      this.spriteSheet = spriteSheet
    } else if (this._spriteSheet) {
      // If we already have a sprite sheet, apply properties
      this._populateSprites()
      this._applyProperties()
    }
  }

  // GObject property getters and setters
  get spriteSheet(): SpriteSheet | null {
    return this._spriteSheet
  }

  set spriteSheet(value: SpriteSheet | null) {
    if (this._spriteSheet === value) return

    this._spriteSheet = value
    this.notify('spriteSheet')
    if (value) {
      this._populateSprites()
      this._applyProperties()
    }
  }

  get scale(): number {
    return this._scale
  }

  set scale(value: number) {
    if (this._scale === value) return

    this._scale = value
    this.notify('scale')
    this.updateScale(value)
  }

  get showGrid(): boolean {
    return this._showGrid
  }

  set showGrid(value: boolean) {
    if (this._showGrid === value) return

    this._showGrid = value
    this.notify('showGrid')
    this._applyProperties()
  }

  get maxColumns(): number {
    return this._maxColumns
  }

  set maxColumns(value: number) {
    if (this._maxColumns === value) return

    this._maxColumns = value
    this.notify('maxColumns')
    this._applyProperties()
  }

  /**
   * Populate the flow box with sprite widgets
   */
  private _populateSprites(): void {
    if (!this._spriteSheet) return

    // Clear existing children
    this._flowBox.remove_all()

    // Add sprites with current scale
    for (const sprite of this._spriteSheet.sprites) {
      const spriteWidget = new SpriteWidget(sprite, this._scale)
      this._flowBox.append(spriteWidget)
    }
  }

  /**
   * Apply current properties to the widget
   */
  private _applyProperties(): void {
    // Apply max columns
    this._flowBox.set_max_children_per_line(this._maxColumns)

    // Apply grid spacing based on showGrid
    if (this._showGrid) {
      this._flowBox.set_row_spacing(1)
      this._flowBox.set_column_spacing(1)
    } else {
      this._flowBox.set_row_spacing(0)
      this._flowBox.set_column_spacing(0)
    }

    // Ensure tight packing when grid is disabled
    if (!this._showGrid) {
      // Set homogeneous to false to prevent equal sizing that could add gaps
      this._flowBox.set_homogeneous(false)
    }

    // Force layout update after property changes
    this._flowBox.queue_resize()
  }

  /**
   * Update scale for all sprite widgets
   */
  updateScale(newScale: number): void {
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
  }

  /**
   * Update max columns setting
   */
  updateMaxColumns(maxColumns: number): void {
    this.maxColumns = maxColumns
  }

  /**
   * Handle sprite selection in the FlowBox
   * @param parent - The FlowBox that contains the selected child
   * @param flowBoxChild - The selected FlowBoxChild
   */
  onSelected(parent: Gtk.FlowBox, flowBoxChild: Gtk.FlowBoxChild) {
    const spriteWidget = flowBoxChild.child as SpriteWidget
    const sprite = spriteWidget.sprite

    if (sprite) {
      console.log(
        'Selected sprite:',
        `Sprite at (${sprite.x}, ${sprite.y}) - ${sprite.width}x${sprite.height}`,
      )
      // Emit the sprite-selected signal for external listeners
      this.emit('sprite-selected', sprite)
    }
  }

  /**
   * Get the currently selected sprite
   * @returns The selected sprite or null if none is selected
   */
  getSelectedSprite(): Sprite | null {
    const selectedChildren = this._flowBox.get_selected_children()
    if (selectedChildren.length > 0) {
      const selectedChild = selectedChildren[0] as Gtk.FlowBoxChild
      const spriteWidget = selectedChild.child as SpriteWidget
      return spriteWidget.sprite
    }
    return null
  }

  /**
   * Clear the current selection
   */
  clearSelection(): void {
    this._flowBox.unselect_all()
  }

  /**
   * Select a sprite by its index in the sprite sheet
   * @param index - The index of the sprite to select
   */
  selectSpriteByIndex(index: number): void {
    const child = this._flowBox.get_child_at_index(index)
    if (child) {
      this._flowBox.select_child(child as Gtk.FlowBoxChild)
    }
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
