import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gio from '@girs/gio-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataTileset, DataTile, DataSpriteSheet, DataVector } from '@pixelrpg/common'
import { Tile } from './tile.ts'
import { Sprite } from './sprite.ts'
import { SpriteSheet } from './sprite-sheet.ts'

import type { ImageResource } from '../types/image-resource.ts'

interface _Tileset {
  _spriteSheet: InstanceType<typeof SpriteSheet>;
  _tiles: InstanceType<typeof Tile>[];
}

class _Tileset extends GObject.Object {
  name: DataTileset['name'];
  class?: DataTileset['class'];
  firstGid: DataTileset['firstGid'];
  tileCount: DataTileset['tileCount'];
  tileWidth: DataTileset['tileWidth'];
  tileHeight: DataTileset['tileHeight'];
  tileOffset: DataTileset['tileOffset'];
  objectAlignment: DataTileset['objectAlignment'];
  orientation: DataTileset['orientation'];
  properties: DataTileset['properties'];

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
    this._tiles = tilesetData.tiles.map((tileData) => new Tile(tileData, null))
  }
}

export const Tileset = GObject.registerClass(
  {
    GTypeName: 'Tileset',
  },
  _Tileset
)
