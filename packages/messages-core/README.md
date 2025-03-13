# @pixelrpg/messages-core

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
  WindowMessageChannel,
  WebKitMessageChannel
} from '@pixelrpg/messages-core';

// Define your message types (optional but recommended)
enum AppMessageTypes {
  LOGIN = 'login',
  LOGOUT = 'logout',
  UPDATE = 'update'
}

// Extend one of the base classes
class MyChannel extends WindowMessageChannel<AppMessageTypes> {
  // Implementation details...
  protected targetWindow = window.parent;
  protected targetOrigin = "https://trusted-domain.com";
}

// Create an instance
const channel = new MyChannel("app-channel");

// Listen for specific message types
channel.on(AppMessageTypes.LOGIN, (payload) => {
  console.log("User logged in:", payload.username);
});

// Send messages - clean and simple!
channel.postMessage(AppMessageTypes.UPDATE, { 
  status: "active", 
  lastUpdate: new Date() 
});

// Use standard DOM onmessage handler if needed
channel.onmessage = (event) => {
  console.log("Raw message event:", event);
};
```

## More Advanced Example

```typescript
import { WebKitMessageChannel } from '@pixelrpg/messages-core';

// Define your message types as string literals
type EditorMessageTypes = 
  | 'document:open'
  | 'document:save'
  | 'document:close'
  | 'selection:change';

// Create a strongly typed channel
class EditorChannel extends WebKitMessageChannel<EditorMessageTypes> {
  constructor(webView) {
    super('editor-channel');
    this.webKitHandler = webView;
  }
  
  protected isWebKitAvailable() {
    return true;
  }
  
  // Add convenience methods for common operations
  openDocument(id: string, path: string): Promise<void> {
    return this.postMessage('document:open', { id, path });
  }
  
  saveDocument(id: string): Promise<void> {
    return this.postMessage('document:save', { id });
  }
}

// Usage
const editor = new EditorChannel(webView);

editor.on('selection:change', (selection) => {
  updateToolbar(selection);
});

editor.openDocument('doc-123', '/path/to/document.txt');
```

## Standards Compliance

This package follows the WHATWG Web Messaging API and WebKit message handler standards:

- Uses the standard `MessageEvent` without modifications
- Standard naming patterns like `postMessage` and `onmessage`
- Compatible with WebKit's `WKScriptMessageHandler` API
- Clean separation between standard APIs and convenience extensions