import type GdkPixbuf from '@girs/gdkpixbuf-2.0'
import type { DataResource } from '@pixelrpg/messages-core'

export interface ImageResource extends DataResource {
    mimeType: 'image/png'
    pixbuf: GdkPixbuf.Pixbuf
}