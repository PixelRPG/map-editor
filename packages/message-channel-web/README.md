# @pixelrpg/message-channel-web

Web implementation of the messaging API for communication between iframe and main window, with RPC endpoint support.

## Features

- Optimized for iframe communication in web browsers
- WHATWG window.postMessage API for cross-origin messaging
- Implements the abstract MessageChannel class for standard messaging
- Unified RpcEndpoint implementation for bidirectional communication
- Promise-based API for asynchronous communication
- Support for both parent-to-child and child-to-parent messaging
- Type safety with TypeScript generics

## Usage

### Basic MessageChannel

```typescript
import { MessageChannel, IframeContext } from '@pixelrpg/message-channel-web';

// In parent window, create a channel to communicate with an iframe
const iframe = document.getElementById('game-iframe') as HTMLIFrameElement;
const parentChannel = new MessageChannel('game-channel', {
  context: IframeContext.PARENT,
  targetIframe: iframe,
  targetOrigin: '*' // Consider security implications, use specific origin in production
});

// Set up message handler
parentChannel.onmessage = (event) => {
  console.log('Received message from iframe:', event.data);
};

// Send message to iframe
parentChannel.postMessage({ 
  type: 'LOAD_GAME',
  gameId: 'zelda-like',
  timestamp: Date.now()
});

// In the iframe, create a channel to communicate with parent
const childChannel = new MessageChannel('game-channel', {
  context: IframeContext.CHILD,
  targetOrigin: '*' // Consider security implications, use specific origin in production
});

// Set up message handler
childChannel.onmessage = (event) => {
  console.log('Received message from parent:', event.data);
};

// Send message to parent
childChannel.postMessage({
  type: 'GAME_LOADED',
  status: 'success',
  timestamp: Date.now()
});
```

### RPC Endpoint

```typescript
import { RpcEndpoint, IframeContext } from '@pixelrpg/message-channel-web';

// In parent window
const iframe = document.getElementById('game-iframe') as HTMLIFrameElement;
const parentRpc = RpcEndpoint.getInstance('game-rpc', {
  context: IframeContext.PARENT,
  targetIframe: iframe,
  targetOrigin: '*' // Consider security implications
});

// Register handler methods that can be called from the iframe
parentRpc.registerHandler('loadProjectData', async (projectId: string) => {
  console.log('Loading project data for:', projectId);
  // Load project data logic
  return { 
    id: projectId,
    name: 'Example Project',
    data: { /* project data */ }
  };
});

// Call methods in the iframe
async function startGame() {
  try {
    const result = await parentRpc.sendRequest('startGame', { level: 1 });
    console.log('Game started:', result);
  } catch (error) {
    console.error('Failed to start game:', error);
  }
}

// In the iframe
const childRpc = RpcEndpoint.getInstance('game-rpc', {
  context: IframeContext.CHILD
});

// Register handler methods that can be called from the parent
childRpc.registerHandler('startGame', async (params: { level: number }) => {
  console.log('Starting game at level:', params.level);
  // Game start logic
  return { success: true, gameState: 'running' };
});

// Call methods in the parent
async function loadProject(projectId: string) {
  try {
    const projectData = await childRpc.sendRequest('loadProjectData', projectId);
    console.log('Project data loaded:', projectData);
    return projectData;
  } catch (error) {
    console.error('Failed to load project data:', error);
    throw error;
  }
}
```

## Implementation Details

The Web implementation provides:

1. `MessageChannel` - Sets up a message event listener on window to receive messages
   - Uses standard window.postMessage API for cross-origin messaging
   - Supports both parent-to-child and child-to-parent communication contexts
   - Provides utility methods for checking readiness and messaging

2. `RpcEndpoint` - Implements unified bidirectional RPC communication
   - Supports both parent and child contexts for iframe communication
   - Handles message routing and promise resolution automatically
   - Provides timeout handling for requests
   - Supports typed responses with generics
   - Registers handlers in the global `window.rpcHandlers` object for direct access

## Dependencies

- @pixelrpg/message-channel-core 