import type { Message, EventListener } from "./index.ts"

export abstract class BaseMessageService {

    abstract send(message: Message): void

    abstract onMessage(callback: EventListener<Message>): void

    abstract onceMessage(callback: EventListener<Message>): void

    abstract offMessage(callback: EventListener<Message>): void

    protected abstract receive(message: Message): void
    protected abstract initReceiver(): void
}

