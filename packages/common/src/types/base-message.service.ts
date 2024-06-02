// TODO: Move to services/

import { EventDispatcher } from "../event-dispatcher.ts"
import { isEqual } from "lodash"

import type { Message, MessageEvent, MessageFile, MessageText, EventListener, MessageEventStateChanged, EventDataStateChanged } from "./index.ts"

export abstract class BaseMessageService<S extends object> {

    events = new EventDispatcher()

    protected _stateProxy: S;

    get state() {
        return this._stateProxy
    }

    constructor(protected readonly messageHandlerName: string, state: S) {
        this.onStateChange = this.onStateChange.bind(this)
        this._stateProxy = new Proxy(state, {
            set: ((target: S, property: keyof S, newValue: S[keyof S]): boolean => {
                const oldValue = target[property];
                // console.log('comparing property ' + property.toString() + ':', oldValue, newValue)
                if (!isEqual(oldValue, newValue)) {
                    target[property] = newValue;
                    this.onStateChange(target, property, newValue, oldValue);
                }
                return true;
            }) as (target: S, property: string, newValue: any) => boolean
        });
        this.onEvent('state-changed', (message) => {
            const data = message.data.data
            const oldValue = this.state[data.property];
            const newValue = data.value;
            if (!isEqual(oldValue, newValue)) {
                this.state[data.property] = newValue
            }
        })
    }

    // TODO: Send changes instead of sending the whole state
    protected onStateChange(state: S, property: keyof S, newValue: any, oldValue: any) {
        const message: MessageEventStateChanged<S> = {
            type: 'event', data: {
                name: 'state-changed', data: {
                    property: property,
                    value: newValue,
                }
            }
        }
        this.send(message)
    }

    abstract send(message: Message): void

    on<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.on(`${this.messageHandlerName}:${eventName}`, callback)
    }

    once<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.once(`${this.messageHandlerName}:${eventName}`, callback)
    }

    off<T = any>(eventName: string, callback: EventListener<T>) {
        this.events.off(`${this.messageHandlerName}:${eventName}`, callback)
    }

    // Text events

    onMessage(callback: EventListener<MessageText>) {
        this.on('text', callback)
    }

    onceMessage(callback: EventListener<MessageText>) {
        this.once('text', callback)
    }

    offMessage(callback: EventListener<MessageText>) {
        this.off('text', callback)
    }

    // File events

    onFile(callback: EventListener<MessageFile>) {
        this.on('file', callback)
    }

    onceFile(callback: EventListener<MessageFile>) {
        this.once('file', callback)
    }

    offFile(callback: EventListener<MessageFile>) {
        this.off('file', callback)
    }

    // Event events

    onEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
    onEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.on(`event:${subEventName}`, callback)
    }

    onceEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
    onceEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.once(`event:${subEventName}`, callback)
    }

    offEvent(eventName: 'state-changed', callback: EventListener<MessageEvent<EventDataStateChanged<S>>>): void
    offEvent<T = any>(subEventName: string, callback: EventListener<MessageEvent<T>>): void {
        this.off(`event:${subEventName}`, callback)
    }

    protected receive(message: Message) {
        if (message.type === 'event') {
            this.events.dispatch(`${this.messageHandlerName}:${message.type}:${message.data.name}`, message)
        } else {
            this.events.dispatch(`${this.messageHandlerName}:${message.type}`, message)
        }
    }

    protected abstract initReceiver(): void
}

