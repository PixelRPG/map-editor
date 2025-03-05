import { MessagesService } from '@pixelrpg/messages-web'
import type { State } from '@pixelrpg/data-core'

export const messagesService = new MessagesService<State>('pixelrpg', {
    spriteSheets: [], resources: [], map: undefined, layers: []
})

