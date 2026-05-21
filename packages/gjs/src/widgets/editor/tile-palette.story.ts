import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@pixelrpg/story-gjs'
import { buildDemoTiles } from '../../__demo__/world-sample'
import { GdkSpriteSetResource } from '../../sprite'
import { TilePalette } from './tile-palette'

/** Showcase: synthetic color swatches. */
export class TilePaletteStory extends StoryWidget {
  private _palette: TilePalette | null = null

  static {
    GObject.registerClass({ GTypeName: 'TilePaletteStory' }, TilePaletteStory)
  }

  constructor() {
    super({
      story: 'Demo colors',
      args: { tileCount: 15, tileSize: 42, columns: 5 },
      meta: TilePaletteStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Tile Palette',
      description: 'FlowBox grid of synthetic swatches with single selection. Emits tile-selected on activation.',
      component: TilePalette.$gtype,
      controls: [
        { name: 'tileCount', label: 'Tile count', type: ControlType.RANGE, min: 1, max: 64, step: 1 },
        { name: 'tileSize', label: 'Tile size', type: ControlType.RANGE, min: 16, max: 96, step: 2 },
        { name: 'columns', label: 'Columns', type: ControlType.RANGE, min: 1, max: 12, step: 1 },
      ],
    }
  }

  initialize(): void {
    this._palette = new TilePalette({
      tileSize: this.args.tileSize as number,
      columns: this.args.columns as number,
      tiles: buildDemoTiles((this.args.tileCount as number) ?? 15),
    })
    this.addContent(this._palette)
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._palette) return
    if (typeof this.args.tileSize === 'number') this._palette.tileSize = this.args.tileSize
    if (typeof this.args.columns === 'number') this._palette.columns = this.args.columns
    if (typeof this.args.tileCount === 'number') this._palette.setTiles(buildDemoTiles(this.args.tileCount))
  }
}

/**
 * Showcase: real sprite sheet (Lokiri Forest, 32×32 tileset) loaded via
 * `setFromSpriteSheet` so the palette auto-adopts the sheet's column
 * count.
 */
export class TilePaletteSpriteSheetStory extends StoryWidget {
  private _palette: TilePalette | null = null

  static {
    GObject.registerClass({ GTypeName: 'TilePaletteSpriteSheetStory' }, TilePaletteSpriteSheetStory)
  }

  constructor() {
    super({
      story: 'Lokiri Forest',
      args: { tileSize: 32, overrideColumns: 0 },
      meta: TilePaletteSpriteSheetStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Tile Palette',
      description:
        'Loads the Lokiri Forest sprite sheet and auto-adopts the sheet\'s native column count (32). Setting "Override columns" >0 reflows the grid.',
      component: TilePalette.$gtype,
      controls: [
        { name: 'tileSize', label: 'Tile size', type: ControlType.RANGE, min: 16, max: 64, step: 2 },
        { name: 'overrideColumns', label: 'Override columns (0 = auto)', type: ControlType.RANGE, min: 0, max: 64, step: 1 },
      ],
    }
  }

  initialize(): void {
    this._palette = new TilePalette({
      tileSize: this.args.tileSize as number,
    })
    this.addContent(this._palette)
    this._loadSheet()
  }

  updateArgs(_args: StoryArgs): void {
    if (!this._palette) return
    if (typeof this.args.tileSize === 'number') this._palette.tileSize = this.args.tileSize
    if (typeof this.args.overrideColumns === 'number' && this.args.overrideColumns > 0) {
      this._palette.columns = this.args.overrideColumns
    }
  }

  private async _loadSheet(): Promise<void> {
    try {
      const resource = await GdkSpriteSetResource.fromPath(
        '../../games/zelda-like/spritesets/lokiri-forest.json',
      )
      if (!resource.spriteSheet || !this._palette) return
      this._palette.setFromSpriteSheet(resource.spriteSheet)
    } catch (error) {
      console.error('TilePaletteSpriteSheetStory: failed to load sprite sheet', error)
    }
  }
}

GObject.type_ensure(TilePaletteStory.$gtype)
GObject.type_ensure(TilePaletteSpriteSheetStory.$gtype)

export const TilePaletteStories: StoryModule = {
  stories: [TilePaletteStory, TilePaletteSpriteSheetStory],
}
