# @pixelrpg/message-channel-gjs

GJS implementation of the messaging API for communication between GJS and WebViews following WHATWG and WebKit standards, with RPC server support.

## Features

- Standards-compliant WebKit communication from GJS to WebViews
- WebKit message handler registration and listening for messages from WebViews
- Based on WebKit's UserContentManager for script message handling
- Implements the abstract MessageChannel class from @pixelrpg/message-channel-core
- RPC server implementation for request-response pattern
- Promise-based API for asynchronous communication
- Uses standard DOM naming patterns for API consistency

## Usage

### Basic MessageChannel

```typescript
import { MessageChannel } from '@pixelrpg/message-channel-gjs';
import WebKit from '@girs/webkit-6.0';

// Create a WebKit WebView
const webView = new WebKit.WebView();

// Create a message channel with a channel name and the WebView instance
const messages = new MessageChannel('my-channel', webView);

// Use standard DOM event handler pattern
messages.onmessage = (event) => {
  console.log('Received raw message event:', event);
};

// Send a message using standard postMessage method
messages.postMessage({ 
  type: 'login',
  username: 'user', 
  timestamp: new Date() 
});
```

### RPC Server

```typescript
import { RpcServer } from '@pixelrpg/message-channel-gjs';
import WebKit from '@girs/webkit-6.0';

// Create a WebKit WebView
const webView = new WebKit.WebView();

// Create an RPC server
const server = new RpcServer('rpc-channel', webView);

// Register methods that can be called by clients in the WebView
server.registerMethod('getMapData', async (params) => {
  const mapId = params as string;
  // Load map data from file system or database
  return {
    id: mapId,
    name: 'Forest Level',
    tiles: [/* ... */],
    entities: [/* ... */]
  };
});

server.registerMethod('saveMapData', async (params) => {
  const mapData = params as any;
  // Save map data to file system or database
  console.log('Saving map data:', mapData);
  return { success: true };
});

// You can also unregister methods when they're no longer needed
// server.unregisterMethod('saveMapData');
```

## Implementation Details

The GJS implementation provides:

1. `MessageChannel` - Implements the abstract MessageChannel class
   - Uses WebKit's UserContentManager to register script message handlers
   - Utilizes GJS's Gio._promisify for asynchronous JavaScript evaluation
   - Sends messages to the WebView using `webView.evaluate_javascript()`
   - Receives messages via the 'script-message-received' signal
   - Converts messages to standard MessageEvent format using the core package

2. `RpcServer` - Implements the RPC server for request-response pattern
   - Registers methods that can be called by clients in the WebView
   - Automatically handles message routing and response sending
   - Provides proper error handling and serialization
   - Supports typed parameters and return values

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