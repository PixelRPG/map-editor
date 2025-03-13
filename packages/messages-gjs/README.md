# @pixelrpg/messages-gjs

GJS implementation of the messaging API for communication between GJS and WebViews following WHATWG and WebKit standards.

## Features

- Standards-compliant WebKit communication from GJS to WebViews
- WebKit message handler registration and listening for messages from WebViews
- Based on WebKit's UserContentManager for script message handling
- Implements the core abstract classes from @pixelrpg/messages-core
- Uses standard DOM naming patterns for API consistency

## Usage

```typescript
import { MessageChannel } from '@pixelrpg/messages-gjs';

// Define message types (can use enum, string literals, or plain strings)
enum MessageTypes {
  LOGIN = 'login',
  LOGOUT = 'logout',
  DATA_UPDATE = 'data:update'
}

// Create a WebKit WebView
const webView = new WebKit.WebView();

// Create a message channel with a channel name
const messages = new MessageChannel<MessageTypes>('my-channel', webView);

// Use standard DOM event handler pattern
messages.onmessage = (event) => {
  console.log('Received raw message event:', event);
};

// Or use type-specific handlers with payload access
messages.on(MessageTypes.DATA_UPDATE, (payload) => {
  console.log('Received update data:', payload);
});

// Send a message using standard postMessage method - clean and simple
messages.postMessage(MessageTypes.LOGIN, { 
  username: 'user', 
  timestamp: new Date() 
});
```

## Standards Compliance

This package implements WebKit's message handler specification to enable standard-compliant communication with WebViews. It uses:

- WebKit UserContentManager for registering script message handlers
- Standard WebKit JavaScript APIs for message passing
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions