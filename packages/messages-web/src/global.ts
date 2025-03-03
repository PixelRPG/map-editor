import type { CustomMessageHandler } from './types/index.ts'
import type { Message } from '@pixelrpg/common'

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
        receiveMessage(message: Message): void
      }
    }
  }
}

