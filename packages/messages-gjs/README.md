# @pixelrpg/messages-gjs

Message service implementation for GJS runtime to communicate with WebKit.WebView.

## Features

- Bidirectional communication between GJS and WebView
- Type-safe message passing
- Event-based communication

## Usage

```typescript
import { MessagesService } from '@pixelrpg/messages-gjs'

const messagesService = new MessagesService('handlerName', initialState)
```