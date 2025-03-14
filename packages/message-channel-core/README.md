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