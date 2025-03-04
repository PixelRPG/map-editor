import { Message } from "@pixelrpg/messages-core"
import { WebkitMessageHandler } from "./webkit-message-handler"

export interface CustomMessageHandler extends WebkitMessageHandler {
  postMessage(message: Message): void
}
