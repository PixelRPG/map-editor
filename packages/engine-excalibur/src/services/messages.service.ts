import { MessagesService } from '@pixelrpg/messages-web'
import type { EngineMessage } from '@pixelrpg/engine-core'

export const messagesService = new MessagesService<EngineMessage>('pixelrpg')

