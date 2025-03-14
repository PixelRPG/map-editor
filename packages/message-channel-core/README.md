# @pixelrpg/message-channel-core

Core messaging library implementing WHATWG and WebKit standards for communication between GJS and WebView runtimes, with RPC support.

## Features

- Standard-compliant messaging with no DOM extensions
- Uses native `MessageEvent` with structured data
- WebKit message handler implementation
- Window.postMessage API support
- Type-safe message routing
- RPC (Remote Procedure Call) support with request-response pattern
- Promise-based API for asynchronous communication
- Platform-specific optimizations for efficient communication
- Simple, intuitive API that follows web standards
- Unified bidirectional communication through a single endpoint

## Usage

### Basic MessageChannel

```typescript
import { 
  MessageChannel,
  MessageEvent
} from '@pixelrpg/message-channel-core';

// Extend the base abstract class
class MyChannel extends MessageChannel {
  // Implementation details...
  
  // You must implement the abstract postMessage method
  async postMessage(data: any): Promise<void> {
    // Your implementation here
    console.log(`Sending message:`, data);
    return Promise.resolve();
  }
}

// Create an instance
const channel = new MyChannel("app-channel");

// Use standard DOM onmessage handler
channel.onmessage = (event: MessageEvent) => {
  console.log("Raw message event:", event);
};

// For handling incoming messages, use the handleMessageEvent method
// which is called in your implementation to process events
```

### Unified RPC Endpoint

```typescript
import {
  RpcEndpoint,
  MethodHandler,
  DirectReplyFunction
} from '@pixelrpg/message-channel-core';

// Create your RPC endpoint implementation
class MyRpcEndpoint extends RpcEndpoint {
  // Implementation details...
  
  // You must implement the abstract postMessage method
  protected async postMessage(message: RpcRequest | RpcResponse): Promise<void> {
    // Your implementation to send messages
    console.log(`Sending message:`, message);
    return Promise.resolve();
  }
  
  // You must implement sendMessage for generic messages
  public async sendMessage(message: BaseMessage): Promise<void> {
    // Your implementation to send generic messages
    console.log(`Sending standard message:`, message);
    return Promise.resolve();
  }
  
  // Example of processing a message with optional direct reply
  processMyMessage(event: MessageEvent, directReply?: DirectReplyFunction) {
    // Pass the directReply function to the handleRpcMessage method
    // if your platform supports direct replies
    this.handleRpcMessage(event, directReply);
  }
}

// Create an endpoint instance
const endpoint = new MyRpcEndpoint("rpc-channel");

// Register methods that can be called by other endpoints
endpoint.registerHandler("getUser", async (params) => {
  const userId = params as string;
  // Fetch user data...
  return { id: userId, name: "John Doe" };
});

// Call a remote method and wait for the response
async function getUser(id: string) {
  try {
    const user = await endpoint.sendRequest("getUser", id);
    console.log("User data:", user);
  } catch (error) {
    console.error("Error fetching user:", error);
  }
}
```

## Core Classes and Utilities

The package provides:

1. `MessageChannel` - Abstract base class for all channel implementations
2. `RpcEndpoint` - Unified abstract base class for bidirectional RPC communication
3. `EventDispatcher` - Event handling utility for typed events
4. `MessageEvent` - Standard-compliant event polyfill
5. Various helper functions and type definitions for message handling

## Platform-Specific Optimizations

The core RPC architecture supports platform-specific optimizations:

- **DirectReply Support**: Platforms that support direct message replies (like WebKit's `script-message-with-reply-received` in GJS) can use the `DirectReplyFunction` to reply directly to requests without separate message sending.
- **Standard Fallback**: Platforms without direct reply support automatically fall back to the standard postMessage approach.

## Implementation Notes

This is a core package that provides the foundation for concrete implementations like:

- `@pixelrpg/message-channel-gjs` - GJS implementation for WebKit WebViews
- `@pixelrpg/message-channel-web` - Web implementation for browser environments

The core package itself doesn't provide runtime functionality but serves as a base 
for platform-specific implementations.

## Standards Compliance

This package follows the WHATWG Web Messaging API and WebKit message handler standards:

- Uses the standard `MessageEvent` without modifications
- Standard naming patterns like `postMessage` and `onmessage`
- Compatible with WebKit's `WKScriptMessageHandler` API
- Clean separation between standard APIs and convenience extensions

## Migration from MessageChannel to RPC Architecture

The project has moved away from the MessageChannel abstraction in favor of a more direct RPC-based architecture. This change brings several benefits:

1. **Direct API Access**: The RpcEndpoint directly accesses platform APIs, reducing abstraction layers.
2. **Optimized Communication**: The GJS implementation leverages WebKit's direct reply mechanism for more efficient request/response patterns.
3. **Consistent Patterns**: The architecture follows a consistent RPC pattern across all platforms.
4. **Better Type Safety**: The RPC mechanism provides better type safety through method registration and typed responses.
5. **Unified Architecture**: A single RpcEndpoint class handles both client and server functionality.

### How to Migrate

1. **Replace MessageChannel with RpcEndpoint**:
   - In all contexts: Replace `MessageChannel` with the appropriate `RpcEndpoint` implementation

2. **Update Message Handling**:
   - Replace `onmessage` handlers with registered RPC methods
   - Replace `postMessage()` calls with `sendRequest()` or `sendMessage()` calls

3. **Using Event-style Messages**:
   - For backward compatibility, use `endpoint.sendMessage()` instead of `messageChannel.postMessage()`
   - Register event handlers using the events dispatcher: `endpoint.events.on('eventName', handler)`

## Basic Usage

### Bidirectional Communication

```typescript
import { RpcEndpoint } from '@pixelrpg/message-channel-gjs'; // or '@pixelrpg/message-channel-web'

// Create an endpoint instance
const endpoint = new RpcEndpoint('my-channel', webview);

// Register method handlers
endpoint.registerHandler('greet', async (params) => {
  return `Hello, ${params.name}!`;
});

// Handle events
endpoint.events.on((message) => {
  console.log('Received a message:', message);
});

// Send a request and wait for a response
const response = await endpoint.sendRequest('remoteMethod', { data: 'some data' });
console.log(response);
```

## RPC Architecture

The RPC system enables bidirectional communication between different environments (e.g., GJS and Web). Each RpcEndpoint can act as both client and server:

1. **Send Requests**: Use `sendRequest(method, params)` to call a remote method
2. **Receive Requests**: Use `registerHandler(name, handler)` to handle incoming requests
   - The handler receives parameters and returns a response (can be async)
3. **Send Messages**: Use `sendMessage(message)` for one-way communication
4. **Receive Messages**: Use `events.on(handler)` to listen for incoming messages

### Understanding the Communication Flow

When using RpcEndpoint in different contexts:

```
┌───────────────────┐                    ┌───────────────────┐
│     Context A     │                    │     Context B     │
│                   │                    │                   │
│  ┌─────────────┐  │  sendRequest()     │  ┌─────────────┐  │
│  │ RpcEndpoint │──┼───────────────────▶│  │ RpcEndpoint │  │
│  └─────────────┘  │                    │  └─────────────┘  │
│        ▲          │                    │        │          │
│        │          │                    │        │          │
│        │          │  registerHandler()  │        ▼          │
│        │          │                    │  ┌─────────────┐  │
│        │          │                    │  │   Handler   │  │
│        │          │                    │  └─────────────┘  │
│        │          │                    │        │          │
│        │          │                    │        │          │
│        │          │                    │        ▼          │
│  ┌─────────────┐  │      Response      │  ┌─────────────┐  │
│  │   Handler   │◀─┼───────────────────┼──│  Response    │  │
│  └─────────────┘  │                    │  └─────────────┘  │
│        │          │                    │        ▲          │
│        ▼          │  sendRequest()     │        │          │
│  ┌─────────────┐  │                    │  ┌─────────────┐  │
│  │ RpcEndpoint │──┼───────────────────▶│  │ RpcEndpoint │  │
│  └─────────────┘  │                    │  └─────────────┘  │
└───────────────────┘                    └───────────────────┘
```

This bidirectional communication allows for more flexible interactions between different runtime environments.