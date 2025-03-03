# @pixelrpg/messages-web

Message service implementation for WebKit WebView runtime to communicate with GJS.

## Features

- Bidirectional communication between WebView and GJS
- Type-safe message passing
- Event-based communication

## Usage

```typescript
import { MessagesService } from '@pixelrpg/messages-web'

const messagesService = new MessagesService('handlerName', initialState)
```