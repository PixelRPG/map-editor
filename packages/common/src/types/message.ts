import { MessageText, MessageFile, MessageEvent, MessageEventMouseEnter, MessageEventMouseLeave, MessageEventMouseMove } from './index.ts'
import { } from './message-file.ts'
import { } from './message-event.ts'

export type Message = MessageText | MessageFile | MessageEvent | MessageEventMouseEnter | MessageEventMouseLeave | MessageEventMouseMove

