import GObject from '@girs/gobject-2.0'
import { DataTileset } from '@pixelrpg/data-core'
import { Tile } from './tile.ts'
import { SpriteSheet } from './sprite-sheet.ts'

import type { ImageResource } from '../types/image-resource.ts'
import { Properties } from '@pixelrpg/data-core'

export interface Tileset {
  _spriteSheet: SpriteSheet;
  _tiles: Tile[];
}

export class Tileset extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Tileset',
    }, this);
  }

  name: string
  class?: string;
  firstGid: number;
  tileCount: number;
  tileWidth: number;
  tileHeight: number;
  tileOffset: { x: number, y: number };
  objectAlignment: string;
  orientation: string;
  properties: Properties;

  constructor(tilesetData: DataTileset, imageResources: ImageResource[]) {
    super()
    this.name = tilesetData.name;
    this.class = tilesetData.class;
    this.firstGid = tilesetData.firstGid;
    this.tileCount = tilesetData.tileCount;
    this.tileWidth = tilesetData.tileWidth;
    this.tileHeight = tilesetData.tileHeight;
    this.tileOffset = tilesetData.tileOffset;
    this.objectAlignment = tilesetData.objectAlignment;
    this.orientation = tilesetData.orientation;
    this.properties = tilesetData.properties;

    this._spriteSheet = new SpriteSheet(tilesetData.spriteSheet, imageResources)
    this._tiles = tilesetData.tiles.map((tileData) => new Tile(tileData))
  }
}
