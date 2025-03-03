# @pixelrpg/messages-web

Message service implementation for WebKit WebView runtime to communicate with GJS in the RPG Maker application.

## Overview

This package facilitates communication between the Excalibur.js game engine running in a WebKit WebView and the GTK-based native RPG Maker application built with GJS. It serves as the browser-side component of a bidirectional messaging system.

## Features

- Bidirectional communication between WebView and GJS
- Type-safe message passing with TypeScript
- Event-based communication architecture
- Integration with WebKit message handlers
- Structured error handling and logging

## Architecture

This package works in tandem with `@pixelrpg/messages-gjs` to create a complete messaging system:
- Web side: Handles WebKit message handlers and provides receiver functions
- GJS side: Manages WebKit WebView and JavaScript evaluation

## Usage

```typescript
import { MessagesService } from '@pixelrpg/messages-web'

// Create a message service with a handler name and initial state
const messagesService = new MessagesService('pixelrpg', initialState)

// Listen for messages from GJS
messagesService.on('map-data', (data) => {
  // Process map data received from GJS
  console.log('Received map data:', data)
})

// Send message to GJS
messagesService.send({
  type: 'map-render-complete',
  payload: { success: true }
})
```

## Integration with RPG Maker

In the RPG Maker application:
- This package runs in the WebKit WebView context
- It communicates with the GJS environment that hosts the WebView
- Map rendering occurs in the WebKit context using Excalibur.js
- Data is shared between the editor interface (GJS) and the game preview (WebKit)

## Requirements

- Modern browser environment with WebKit support
- Corresponding GJS application using `@pixelrpg/messages-gjs`