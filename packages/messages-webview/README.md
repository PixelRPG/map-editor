# @pixelrpg/messages-webview

Message service implementation for WebView runtime to communicate with GJS.

## Features

- Bidirectional communication between WebView and GJS
- Type-safe message passing
- Event-based communication

## Usage

```typescript
import { MessagesService } from '@pixelrpg/messages-webview'

const messagesService = new MessagesService('handlerName', initialState)
```