# @pixelrpg/messages-web

Web implementation of the messaging API for communication between WebViews and GJS following WHATWG and WebKit standards.

## Features

- Standards-compliant WebKit message handlers for communication with GJS
- WHATWG window.postMessage fallback for cross-context messaging
- Automatic detection and use of available communication channels
- Implements the core abstract classes from @pixelrpg/messages-core
- Uses standard DOM naming patterns for API consistency

## Usage

```typescript
import { MessageChannel } from '@pixelrpg/messages-web';

// Define message types (can use enum, string literals, or plain strings)
enum AppMessageTypes {
  LOGIN = 'login',
  LOGOUT = 'logout',
  STATUS_UPDATE = 'status:update'
}

// Create a message channel with a channel name
const messages = new MessageChannel<AppMessageTypes>('my-channel');

// Use standard DOM event handler pattern
messages.onmessage = (event) => {
  console.log('Received raw message event:', event);
};

// Or use type-specific handlers with payload access
messages.on(AppMessageTypes.STATUS_UPDATE, (payload) => {
  console.log('Status updated:', payload.status);
});

// Send a message using standard postMessage method - clean and simple
messages.postMessage(AppMessageTypes.LOGIN, { 
  username: 'user123', 
  device: 'mobile',
  timestamp: new Date()
});
```

## Standards Compliance

This package implements WebKit's message handler specification and WHATWG messaging standards to enable communication with GJS contexts. It uses:

- Standard WebKit `window.webkit.messageHandlers` API when available
- Standard WHATWG `window.postMessage` API when WebKit handlers aren't available
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions
- Maintains backward compatibility with older messaging patterns