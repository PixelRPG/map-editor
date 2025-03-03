import { MessagesService } from '@pixelrpg/messages-web'
import type { State } from '@pixelrpg/common'

export const messagesService = new MessagesService<State>('pixelrpg', {
    tilesets: [], resources: [], layers: []
})

