import { MessagesService } from '@pixelrpg/messages-webview'
import type { State } from '@pixelrpg/common'

export const messagesService = new MessagesService<State>('pixelrpg', { tilesets: [] })

