import type { CustomMessageHandler } from './types/index.ts'

declare global {
  interface Window {
    webkit?: {
      messageHandlers: {
        [handlerName: string]: CustomMessageHandler | undefined
      }
    }
  }
}
