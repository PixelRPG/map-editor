import type { CustomMessageHandler } from './types/index.ts'
import type { Message } from '@pixelrpg/messages-core'

declare global {
  interface Window {
    webkit?: {
      messageHandlers: {
        [handlerName: string]: CustomMessageHandler | undefined
      }
    }

    messageReceivers?: {
      [handlerName: string]: {
        /** Custom method to receive messages from GJS */
        receive(message: Message): void
      }
    }
  }
}

