import type GdkPixbuf from '@girs/gdkpixbuf-2.0'
import type { ImageReference } from '@pixelrpg/data-core'

export interface ImageResource {
    mimeType: 'image/png'
    pixbuf: GdkPixbuf.Pixbuf
    path: string
}