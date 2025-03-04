import type { EventDataStateChanged, MessageEvent } from './index.ts'

export type MessageEventStateChanged<T extends object = any> = MessageEvent<EventDataStateChanged<T>>

