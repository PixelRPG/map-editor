import { Message } from "./message"

export interface BaseMessageService {
    send(message: Message): void

    onMessage(callback: (message: Message) => void): void

    onceMessage(callback: (message: Message) => void): void

    offMessage(callback: (message: Message) => void): void
}

