# @pixelrpg/message-channel-web

Web implementation of the messaging API for communication between WebViews and GJS following WHATWG and WebKit standards, with RPC endpoint support.

## Features

- Standards-compliant WebKit message handlers for communication with GJS
- WHATWG window.postMessage fallback for cross-context messaging
- Implements the abstract MessageChannel class from @pixelrpg/message-channel-core
- Unified RpcEndpoint implementation for bidirectional communication
- Promise-based API for asynchronous communication
- Uses standard DOM naming patterns for API consistency

## Usage

### Basic MessageChannel

```typescript
import { MessageChannel } from '@pixelrpg/message-channel-web';

// Create a message channel with a channel name
const messages = new MessageChannel('my-channel');

// Use standard DOM event handler pattern
messages.onmessage = (event) => {
  console.log('Received raw message event:', event);
};

// Send a message using standard postMessage method
messages.postMessage({ 
  type: 'login',
  username: 'user123', 
  device: 'mobile',
  timestamp: new Date()
});
```

### RPC Endpoint

```typescript
import { RpcEndpoint } from '@pixelrpg/message-channel-web';

// Create an RPC endpoint
const endpoint = RpcEndpoint.getInstance('rpc-channel');

// Register handler methods that can be called from GJS
endpoint.registerHandler('updateUIState', (state) => {
  console.log('Updating UI state:', state);
  // Update UI logic here
  return { success: true };
});

// Call a remote method and wait for the response
async function login(username: string, password: string) {
  try {
    const result = await endpoint.sendRequest('login', { username, password });
    console.log('Login successful:', result);
    return result;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

// Call another method
async function getUserProfile(userId: string) {
  try {
    const profile = await endpoint.sendRequest('getUserProfile', userId);
    console.log('User profile:', profile);
    return profile;
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
}
```

## Implementation Details

The Web implementation provides:

1. `MessageChannel` - Sets up a message event listener on window to receive messages
   - Uses a WebKitMessageHandler (if available) for sending messages
   - The handler is manually set - the implementation does not automatically detect the WebKit handler
   - Provides a simple check for handler availability via isHandlerRegistered()

2. `RpcEndpoint` - Implements unified bidirectional RPC communication
   - Directly uses WebKit message handlers (when available) and window.postMessage APIs
   - Automatically detects appropriate communication channel (WebKit or window messaging)
   - Can both send requests and receive/handle requests from GJS
   - Automatically handles message routing and promise resolution
   - Provides timeout handling for requests
   - Supports typed responses with generics
   - Registers handlers in the global `window.rpcHandlers` object for access from GJS

## Dependencies

- @pixelrpg/message-channel-core

## Standards Compliance

This package implements WebKit's message handler specification and WHATWG messaging standards to enable communication with GJS contexts. It uses:

- Standard WebKit `window.webkit.messageHandlers` API when handler is available
- Standard WHATWG `window.postMessage` API for general messaging
- Standard DOM naming conventions like `postMessage` and `onmessage`
- Clean standard MessageEvent handling without custom extensions