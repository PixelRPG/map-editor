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

### RPC Client-Server

```typescript
import {
  RpcClient,
  RpcServer,
  MethodHandler,
  DirectReplyFunction
} from '@pixelrpg/message-channel-core';

// Server-side (extends RpcServer)
class MyRpcServer extends RpcServer {
  // Implementation details...
  
  // You must implement the abstract postMessage method
  protected async postMessage(message: RpcResponse): Promise<void> {
    // Your implementation to send the response
    console.log(`Sending response:`, message);
    return Promise.resolve();
  }
  
  // Example of processing a message with optional direct reply
  processMyMessage(event: MessageEvent, directReply?: DirectReplyFunction) {
    // Pass the directReply function to the handleRpcMessage method
    // if your platform supports direct replies
    this.handleRpcMessage(event, directReply);
  }
}

// Create a server instance
const server = new MyRpcServer("rpc-channel");

// Register methods that can be called by clients
server.registerMethod("getUser", async (params) => {
  const userId = params as string;
  // Fetch user data...
  return { id: userId, name: "John Doe" };
});

// Client-side (extends RpcClient)
class MyRpcClient extends RpcClient {
  // Implementation details...
  
  // You must implement the abstract postMessage method
  protected async postMessage(message: RpcRequest): Promise<void> {
    // Your implementation to send the request
    console.log(`Sending request:`, message);
    return Promise.resolve();
  }
}

// Create a client instance
const client = new MyRpcClient("rpc-channel");

// Call a remote method and wait for the response
async function getUser(id: string) {
  try {
    const user = await client.sendRequest("getUser", id);
    console.log("User data:", user);
  } catch (error) {
    console.error("Error fetching user:", error);
  }
}
```

## Core Classes and Utilities

The package provides:

1. `MessageChannel` - Abstract base class for all channel implementations
2. `RpcClient` - Abstract base class for RPC clients
3. `RpcServer` - Abstract base class for RPC servers with direct reply support
4. `EventDispatcher` - Event handling utility for typed events
5. `MessageEvent` - Standard-compliant event polyfill
6. Various helper functions and type definitions for message handling

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

The project is moving away from the MessageChannel abstraction in favor of a more direct RPC-based architecture. This change brings several benefits:

1. **Direct API Access**: Both RpcServer and RpcClient now directly access platform APIs, reducing abstraction layers.
2. **Optimized Communication**: The GJS implementation leverages WebKit's direct reply mechanism for more efficient request/response patterns.
3. **Consistent Patterns**: The architecture now follows a consistent RPC pattern across all platforms.
4. **Better Type Safety**: The RPC mechanism provides better type safety through method registration and typed responses.

### How to Migrate

1. **Replace MessageChannel with RpcServer/RpcClient**:
   - In GJS contexts: Replace `MessageChannel` with `RpcServer`
   - In Web contexts: Replace `MessageChannel` with `RpcClient`

2. **Update Message Handling**:
   - Replace `onmessage` handlers with registered RPC methods
   - Replace `postMessage()` calls with `sendRequest()` calls

3. **Using Event-style Messages**:
   - For backward compatibility, use `rpcServer.sendMessage()` instead of `messageChannel.postMessage()`
   - Register event handlers using the events dispatcher: `rpcClient.events.on('eventName', handler)`

## Basic Usage

### Server Side (Receiving Requests)

```typescript
import { RpcServer } from '@pixelrpg/message-channel-gjs'; // or '@pixelrpg/message-channel-web'

// Create a server instance
const server = new RpcServer('my-channel', webview);

// Register method handlers
server.registerMethod('greet', async (params) => {
  return `Hello, ${params.name}!`;
});

// Handle events
server.events.on((message) => {
  console.log('Received a message:', message);
});
```

### Client Side (Sending Requests)

```typescript
import { RpcClient } from '@pixelrpg/message-channel-web'; // or '@pixelrpg/message-channel-gjs'

// Create a client instance
const client = new RpcClient('my-channel');

// Send a request and wait for a response
const response = await client.sendRequest('greet', { name: 'World' });
console.log(response); // "Hello, World!"

// Register a handler that can be called by the server
client.registerHandler('notify', (data) => {
  console.log('Notification received:', data);
  return { received: true };
});
```

## RPC Architecture

The RPC system enables bidirectional communication between different environments (e.g., GJS and Web). Each side can act as both client and server:

1. **RpcServer**: Receives requests, processes them, and sends responses
   - Use `registerMethod(name, handler)` to handle incoming requests
   - The handler receives parameters and returns a response (can be async)

2. **RpcClient**: Sends requests and processes responses
   - Use `sendRequest(method, params)` to call a remote method
   - Use `registerHandler(name, handler)` to register handlers that the server can call

### Understanding the Communication Flow

When using both the RpcServer and RpcClient in different contexts:

```
┌───────────────────┐                    ┌───────────────────┐
│     Context A     │                    │     Context B     │
│                   │                    │                   │
│  ┌─────────────┐  │  sendRequest()     │  ┌─────────────┐  │
│  │  RpcClient  │──┼───────────────────▶│  │  RpcServer  │  │
│  └─────────────┘  │                    │  └─────────────┘  │
│        ▲          │                    │        │          │
│        │          │                    │        │          │
│        │          │  registerMethod()  │        ▼          │
│        │          │                    │  ┌─────────────┐  │
│        │          │                    │  │   Handler   │  │
│        │          │                    │  └─────────────┘  │
│        │          │                    │        │          │
│        │          │                    │        │          │
│        │          │                    │        ▼          │
│  ┌─────────────┐  │      Response      │  ┌─────────────┐  │
│  │   Handler   │◀─┼───────────────────┼──│  Response    │  │
│  └─────────────┘  │                    │  └─────────────┘  │
│                   │                    │                   │
└───────────────────┘                    └───────────────────┘
```

Similarly, Context B can call methods in Context A using its own RpcClient:

```
┌───────────────────┐                    ┌───────────────────┐
│     Context A     │                    │     Context B     │
│                   │                    │                   │
│  ┌─────────────┐  │                    │  ┌─────────────┐  │
│  │  RpcServer  │◀─┼───────────────────┼──│  RpcClient  │  │
│  └─────────────┘  │                    │  └─────────────┘  │
│        │          │                    │                   │
│        │          │                    │                   │
│        ▼          │                    │                   │
│  ┌─────────────┐  │                    │                   │
│  │   Handler   │  │                    │                   │
│  └─────────────┘  │                    │                   │
│        │          │                    │                   │
│        │          │                    │                   │
│        ▼          │                    │                   │
│  ┌─────────────┐  │                    │                   │
│  │  Response   │──┼───────────────────▶│                   │
│  └─────────────┘  │                    │                   │
│                   │                    │                   │
└───────────────────┘                    └───────────────────┘
```

## Implementation Details

### In Web Context

In the web implementation:
- `RpcClient.registerHandler()` creates entries in the global `window.rpcHandlers` object
- When GJS sends a request, it evaluates JavaScript that calls the appropriate handler
- The response is returned directly through the WebKit JavaScript evaluation API

### In GJS Context

In the GJS implementation:
- `RpcServer.registerMethod()` adds handlers to an internal map
- When web calls these methods through RPC, the handlers are executed
- Results are returned through WebKit's message reply mechanism

## Migrating from Event-Based Messaging

To migrate from older event-based messaging:

- Replace `postMessage()` calls with `sendRequest()` calls
- Replace message event listeners with registered methods
- Use typed message interfaces instead of custom message formats

## Type Safety

All messages are fully typed using TypeScript interfaces:

```typescript
import { RpcClient, DirectReplyFunction } from '@pixelrpg/message-channel-core';

// Type your requests and responses
interface UserRequest {
  id: number;
}

interface UserResponse {
  id: number;
  name: string;
  email: string;
}

// Use with generics for type safety
const user = await client.sendRequest<UserResponse>("getUser", { id: 1 });
console.log(user.name); // Fully typed!
```