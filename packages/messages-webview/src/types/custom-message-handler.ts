import { Message } from "@pixelrpg/common"
import { WebkitMessageHandler } from "./webkit-message-handler"

export interface CustomMessageHandler extends WebkitMessageHandler {
  postMessage(message: Message): void
}
