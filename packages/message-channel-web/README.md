# @pixelrpg/message-channel-web

Web implementation of the messaging API for communication between WebViews and GJS following WHATWG and WebKit standards.

## Features

- Standards-compliant WebKit message handlers for communication with GJS
- WHATWG window.postMessage fallback for cross-context messaging
- Implements the abstract MessageChannel class from @pixelrpg/message-channel-core
- Uses standard DOM naming patterns for API consistency

## Usage

```typescript
import { MessageChannel } from '@pixelrpg/message-channel-web';

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

// Send a message using standard postMessage method
messages.postMessage(AppMessageTypes.LOGIN, { 
  username: 'user123', 
  device: 'mobile',
  timestamp: new Date()
});
```

## Implementation Details

The Web implementation:

1. Sets up a message event listener on window to receive messages
2. Uses a WebKitMessageHandler (if available) for sending messages
3. The handler is manually set - the implementation does not automatically detect the WebKit handler
4. Provides a simple check for handler availability via isHandlerRegistered()

## WebKit Message Handler

The current implementation provides a placeholder for WebKit message handlers, but the WebKit handler needs to be manually set after creation. To fully utilize the WebKit channel:

```typescript
import { MessageChannel } from '@pixelrpg/message-channel-web';

const channel = new MessageChannel('my-channel');

// Set the WebKit handler manually 
// The current implementation has the webKitHandler property set to null by default
channel.webKitHandler = window.webkit.messageHandlers.myHandler;

// Now you can use the WebKit channel
channel.postMessage('login', { username: 'user' });
```

## Dependencies

- @pixelrpg/message-channel-core

## Standards Compliance

This package implements WebKit's message handler specification and WHATWG messaging standards to enable communication with GJS contexts. It uses:

- Standard WebKit `window.webkit.messageHandlers` API when handler is available
- Standard WHATWG `window.postMessage` API for general messaging
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions