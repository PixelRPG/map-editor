import type { MessageText, MessageFile, MessageEvent, MessageEventMouseEnter, MessageEventMouseLeave, MessageEventMouseMove } from './index.ts'

export type Message = MessageText | MessageFile | MessageEvent | MessageEventMouseEnter | MessageEventMouseLeave | MessageEventMouseMove

