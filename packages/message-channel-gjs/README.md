# @pixelrpg/message-channel-gjs

GJS implementation of the messaging API for communication between GJS and WebViews following WHATWG and WebKit standards.

## Features

- Standards-compliant WebKit communication from GJS to WebViews
- WebKit message handler registration and listening for messages from WebViews
- Based on WebKit's UserContentManager for script message handling
- Implements the abstract MessageChannel class from @pixelrpg/message-channel-core
- Uses standard DOM naming patterns for API consistency

## Usage

```typescript
import { MessageChannel } from '@pixelrpg/message-channel-gjs';
import WebKit from '@girs/webkit-6.0';

// Define message types (can use enum, string literals, or plain strings)
enum MessageTypes {
  LOGIN = 'login',
  LOGOUT = 'logout',
  DATA_UPDATE = 'data:update'
}

// Create a WebKit WebView
const webView = new WebKit.WebView();

// Create a message channel with a channel name and the WebView instance
const messages = new MessageChannel<MessageTypes>('my-channel', webView);

// Use standard DOM event handler pattern
messages.onmessage = (event) => {
  console.log('Received raw message event:', event);
};

// Send a message using standard postMessage method
messages.postMessage(MessageTypes.LOGIN, { 
  username: 'user', 
  timestamp: new Date() 
});
```

## Implementation Details

The GJS implementation:

1. Uses WebKit's UserContentManager to register script message handlers
2. Utilizes GJS's Gio._promisify for asynchronous JavaScript evaluation
3. Sends messages to the WebView using `webView.evaluate_javascript()`
4. Receives messages via the 'script-message-received' signal
5. Converts messages to standard MessageEvent format using the core package

## Dependencies

- @girs/webkit-6.0
- @girs/javascriptcore-6.0
- @girs/gio-2.0
- @pixelrpg/message-channel-core

## Standards Compliance

This package implements WebKit's message handler specification to enable standard-compliant communication with WebViews. It uses:

- WebKit UserContentManager for registering script message handlers
- Standard WebKit JavaScript APIs for message passing
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions