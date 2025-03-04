import GObject from '@girs/gobject-2.0'
import type { DataGraphic } from '@pixelrpg/common'

// import Template from './graphic.ui?raw'

export interface Graphic {
  // Add GObject properties here
}

export class Graphic extends GObject.Object implements DataGraphic {

  static {
    GObject.registerClass({
      GTypeName: 'Graphic',
    }, this);
  }

  // TODO: check which properties are not used / needed
  id: DataGraphic['id']
  width: DataGraphic['width']
  height: DataGraphic['height']
  opacity: DataGraphic['opacity']
  rotation: DataGraphic['rotation']
  scale: DataGraphic['scale']
  flipHorizontal: DataGraphic['flipHorizontal']
  flipVertical: DataGraphic['flipVertical']
  origin: DataGraphic['origin']

  constructor(dataGraphic: DataGraphic) {
    super()
    this.id = dataGraphic.id
    this.width = dataGraphic.width
    this.height = dataGraphic.height
    this.opacity = dataGraphic.opacity
    this.rotation = dataGraphic.rotation
    this.scale = dataGraphic.scale
    this.flipHorizontal = dataGraphic.flipHorizontal
    this.flipVertical = dataGraphic.flipVertical
    this.origin = dataGraphic.origin
  }
}
