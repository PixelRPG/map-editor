# @pixelrpg/messages-gjs

Message service implementation for GJS runtime to communicate with WebKit.WebView in the RPG Maker application.

## Overview

This package facilitates communication between the GTK-based native RPG Maker application built with GJS and the Excalibur.js game engine running in a WebKit WebView. It serves as the GJS-side component of a bidirectional messaging system.

## Features

- Bidirectional communication between GJS and WebView
- Type-safe message passing with TypeScript
- Event-based communication architecture
- Integration with WebKit WebView and UserContentManager
- Structured error handling and logging

## Architecture

This package works in tandem with `@pixelrpg/messages-web` to create a complete messaging system:
- GJS side: Manages WebKit WebView and JavaScript evaluation
- Web side: Handles WebKit message handlers and provides receiver functions

## Usage

```typescript
import { MessagesService } from '@pixelrpg/messages-gjs'
import WebKit from '@girs/webkit-6.0'

// Create a WebKit WebView
const webView = new WebKit.WebView()

// Create a message service with a handler name, initial state, and the WebView
const messagesService = new MessagesService('pixelrpg', initialState, webView)

// Listen for messages from the WebView
messagesService.on('map-render-complete', (data) => {
  // Process completion data received from WebView
  console.log('Map rendering completed:', data)
})

// Send message to WebView
messagesService.send({
  type: 'map-data',
  payload: mapData
})
```

## Integration with RPG Maker

In the RPG Maker application:
- This package runs in the GJS environment that hosts the GTK UI
- It communicates with the WebKit WebView that renders maps using Excalibur.js
- The GTK application controls the game editor interface
- Data is shared between the editor interface (GJS) and the game preview (WebKit)

## Requirements

- GJS runtime environment
- WebKit 6.0 with GObject introspection
- Corresponding WebView using `@pixelrpg/messages-web`