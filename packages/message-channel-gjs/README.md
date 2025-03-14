# @pixelrpg/message-channel-gjs

GJS implementation of the messaging API for communication between GJS and WebViews following WHATWG and WebKit standards, with RPC endpoint support.

## Features

- Standards-compliant WebKit communication from GJS to WebViews
- WebKit message handler registration and listening for messages from WebViews
- Based on WebKit's UserContentManager for script message handling
- Implements the abstract MessageChannel class from @pixelrpg/message-channel-core
- Unified RpcEndpoint implementation with bidirectional communication support
- Promise-based API for asynchronous communication
- Uses standard DOM naming patterns for API consistency

## Usage

### MessageChannel is Deprecated

The MessageChannel class is deprecated. Please use the RpcEndpoint pattern instead for better communication with WebViews.

### RPC Endpoint

```typescript
import { RpcEndpoint } from '@pixelrpg/message-channel-gjs';
import WebKit from '@girs/webkit-6.0';

// Create an RPC endpoint with a channel name and WebView
const webView = new WebKit.WebView();
const endpoint = new RpcEndpoint('my-channel', webView);

// Register methods that can be called from the web client
endpoint.registerHandler('saveData', async (params) => {
  const { filename, data } = params;
  await saveToFile(filename, data);
  return { success: true };
});

endpoint.registerHandler('getData', async (params) => {
  const { id } = params;
  const data = await loadFromDatabase(id);
  return data;
});

// Call methods on the web client side
try {
  const result = await endpoint.sendRequest('updateUI', { component: 'dashboard', visible: true });
  console.log('UI updated:', result);
} catch (error) {
  console.error('Failed to update UI:', error);
}
```

## Implementation Details

The GJS implementation provides:

1. `MessageChannel` - Implements the abstract MessageChannel class
   - Uses WebKit's UserContentManager to register script message handlers
   - Utilizes GJS's Gio._promisify for asynchronous JavaScript evaluation
   - Sends messages to the WebView using `webView.evaluate_javascript()`
   - Receives messages via the 'script-message-received' signal
   - Converts messages to standard MessageEvent format using the core package

2. `RpcEndpoint` - Implements unified bidirectional RPC communication
   - Uses WebKit's `script-message-with-reply-received` signal for efficient request-response
   - Directly responds to RPC requests without needing a separate message channel
   - Can both send requests to and receive/handle requests from WebViews
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
- WebKit's script-message-with-reply for efficient RPC communication
- Standard WebKit JavaScript APIs for message passing
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions