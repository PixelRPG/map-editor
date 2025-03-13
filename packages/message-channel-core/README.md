# @pixelrpg/message-channel-core

Core messaging library implementing WHATWG and WebKit standards for communication between GJS and WebView runtimes.

## Features

- Standard-compliant messaging with no DOM extensions
- Uses native `MessageEvent` with structured data
- WebKit message handler implementation
- Window.postMessage API support
- Type-safe message routing with enum support
- Simple, intuitive API that follows web standards

## Usage

```typescript
import { 
  MessageChannel,
  MessageEvent,
  createMessageData
} from '@pixelrpg/message-channel-core';

// Define your message types (optional but recommended)
enum AppMessageTypes {
  LOGIN = 'login',
  LOGOUT = 'logout',
  UPDATE = 'update'
}

// Extend the base abstract class
class MyChannel extends MessageChannel<AppMessageTypes> {
  // Implementation details...
  
  // You must implement the abstract postMessage method
  async postMessage<P = any>(messageType: AppMessageTypes, payload: P): Promise<void> {
    // Your implementation here
    console.log(`Sending message: ${messageType}`, payload);
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

## Core Classes and Utilities

The package provides:

1. `MessageChannel<T>` - Abstract base class for all channel implementations
2. `MessageEvent` - Standard-compliant event polyfill
3. `createMessageData()` - Helper function to create properly structured messages
4. Various type definitions for message handling

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