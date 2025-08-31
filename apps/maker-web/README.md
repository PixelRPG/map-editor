# PixelRPG Map Editor - Web Version

A browser-based implementation of the PixelRPG Map Editor, providing a modern web interface for creating and editing tile-based RPG game maps. Built with TypeScript and featuring real-time engine integration through iframe-based RPC communication.

## ✨ Features

- **Browser-Based Editing**: Full-featured map editor accessible through any modern web browser
- **Real-Time Preview**: Live game engine preview with Excalibur.js integration
- **Tile-Based Design**: Intuitive tilemap creation and editing with multiple layers
- **Project Management**: Complete project lifecycle management with asset organization
- **Cross-Platform RPC**: Bidirectional communication between editor UI and game engine
- **Responsive Design**: Works on desktop and tablet devices
- **Type Safety**: Full TypeScript support for reliable development
- **Hot Reload**: Development workflow with live updates

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ with npm or yarn
- **Modern Web Browser** with WebGL support (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- **Git** for cloning the repository

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Install dependencies
yarn install

# Start the web development server
yarn workspace @pixelrpg/maker-web dev
```

The application will be available at `http://localhost:3000`

## 🎮 Usage

### Basic Workflow

1. **Open the Editor**: Navigate to the running application in your browser
2. **Create/Load Project**: Use the project panel to create a new project or load an existing one
3. **Edit Maps**: Use the tile tools to paint, erase, and modify map tiles
4. **Preview Changes**: See real-time updates in the integrated game engine preview
5. **Save Work**: Export your project when ready

### Editor Interface

```
┌─────────────────────────────────────────────────┐
│ Toolbar: File | Edit | View | Tools | Help       │
├─────────────────┬───────────────────────────────┤
│ Project Panel   │                               │
│ • Assets        │        Map Editor Canvas       │
│ • Maps          │                               │
│ • Properties    │  ┌─────────────────────────┐  │
├─────────────────┤  │                         │  │
│ Tools Panel     │  │     Game Engine         │  │
│ • Tile Brush    │  │     Preview             │  │
│ • Eraser        │  │                         │  │
│ • Fill Tool     │  └─────────────────────────┘  │
└─────────────────┴───────────────────────────────┘
```

### Keyboard Shortcuts

- `Ctrl+N`: New project
- `Ctrl+O`: Open project
- `Ctrl+S`: Save project
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Space`: Pan canvas
- `Mouse Wheel`: Zoom in/out

## 🏗️ Architecture

### iframe-Based Integration

The web version uses an iframe to embed the game engine, mirroring the WebView approach used in the desktop version:

```
┌─────────────────┐     RPC      ┌─────────────────┐
│   Web UI        │◄──────────► │   iframe        │
│   (Main Window) │             │   (Engine)      │
│                 │             │                 │
│ • Project View  │             │ • Excalibur.js  │
│ • Asset Browser │             │ • Game Canvas   │
│ • Property      │             │ • Live Preview  │
│   Inspector     │             │                 │
└─────────────────┘             └─────────────────┘
```

#### Benefits of iframe Approach

- **RPC Testing**: Validates cross-context communication (Browser ↔ iframe)
- **Security**: Isolated execution environment for the game engine
- **Consistency**: Same communication patterns as desktop WebView implementation
- **Debugging**: Separate developer tools for UI and engine

#### Future Architecture Options

**Direct Integration (Alternative):**
```typescript
// Direct engine integration (potential future enhancement)
import { Engine } from '@pixelrpg/engine-excalibur';

const engine = new Engine();
engine.initialize({
  canvas: document.getElementById('game-canvas'),
  width: 800,
  height: 600
});
```

**Benefits:**
- Reduced communication overhead
- Better performance
- Simplified architecture

## 🔧 Development

### Development Commands

```bash
# Install dependencies
yarn install

# Start development server with hot reload
yarn dev

# Build for production
yarn build

# Preview production build locally
yarn preview

# Type checking
yarn type-check

# Linting
yarn lint
```

### Development Workflow

```bash
# 1. Start the development server
yarn dev

# 2. Open browser to http://localhost:3000

# 3. Make changes to source files
#    - Hot reload will automatically update the browser

# 4. Test RPC communication
#    - Check browser console for communication logs
#    - Verify iframe content loads correctly

# 5. Build for production testing
yarn build && yarn preview
```

### Project Structure

```
apps/maker-web/
├── src/
│   ├── main.ts              # Application entry point
│   ├── types.ts             # TypeScript type definitions
│   ├── components/          # UI components
│   │   ├── ProjectPanel.ts  # Project management
│   │   ├── MapEditor.ts     # Main editor canvas
│   │   ├── ToolsPanel.ts    # Editing tools
│   │   └── EnginePreview.ts # Game engine iframe
│   ├── services/            # Business logic
│   │   ├── ProjectService.ts # Project operations
│   │   ├── MapService.ts     # Map editing logic
│   │   └── RpcService.ts     # RPC communication
│   └── utils/               # Utility functions
├── dist/                    # Built application
├── index.html               # HTML entry point
├── package.json             # Dependencies and scripts
└── tsconfig.json            # TypeScript configuration
```

## 📖 API Usage Examples

### Project Management

```typescript
import { ProjectService } from './services/ProjectService';

// Create a new project
const projectService = new ProjectService();
const project = await projectService.createProject({
  name: 'My RPG Game',
  description: 'An epic adventure',
  tileSize: 32,
  mapWidth: 50,
  mapHeight: 50
});

// Load existing project
const loadedProject = await projectService.loadProject('/path/to/project.json');
```

### Map Editing

```typescript
import { MapService } from './services/MapService';

// Initialize map service
const mapService = new MapService();

// Create a new map
const map = await mapService.createMap('overworld', {
  width: 100,
  height: 100,
  layers: ['ground', 'objects', 'overlay']
});

// Paint tiles
await mapService.setTile(map.id, 10, 15, {
  tileId: 5,
  layer: 'ground'
});

// Get tile data
const tile = await mapService.getTile(map.id, 10, 15, 'ground');
```

### RPC Communication

```typescript
import { RpcService } from './services/RpcService';

// Initialize RPC service
const rpcService = new RpcService();

// Register handler for engine events
rpcService.registerHandler('engine-ready', async () => {
  console.log('Game engine is ready');
  // Initialize UI components
});

// Send commands to engine
await rpcService.sendRequest('load-map', {
  mapId: 'overworld',
  position: { x: 0, y: 0 }
});
```

## 🐛 Troubleshooting

### Common Issues

#### Engine Preview Not Loading

If the game engine preview iframe doesn't load:

```bash
# Check that the engine package is built
yarn workspace @pixelrpg/engine-excalibur build

# Verify iframe src URL is correct
# Should point to the built engine files
```

#### RPC Communication Errors

If RPC messages aren't working:

```javascript
// Check browser console for errors
console.log('RPC Service Status:', rpcService.isConnected);

// Verify iframe is loaded before sending messages
await rpcService.waitForConnection();
```

#### Build Errors

```bash
# Clear cache and reinstall
rm -rf node_modules dist
yarn install
yarn build
```

### Development Tips

- Use browser developer tools to inspect iframe content
- Check network tab for failed resource loads
- Enable verbose logging for RPC communication debugging
- Test on multiple browsers to ensure compatibility

## 🚀 Deployment

### Production Build

```bash
# Build for production
yarn build

# The built files will be in the 'dist' directory
# Ready for deployment to any static hosting service
```

### Environment Configuration

Create environment-specific configurations:

```javascript
// config/production.js
export const config = {
  engineUrl: 'https://your-cdn.com/engine/',
  apiUrl: 'https://api.your-app.com/',
  debug: false
};
```

## 🤝 Contributing

This web version serves as a testing environment for the core engine functionality. Contributions should focus on:

- Improving the user interface and user experience
- Adding new editing features and tools
- Enhancing RPC communication reliability
- Optimizing performance for web environments
- Improving browser compatibility

## 📚 Related Documentation

- [Main Project README](../../README.md) - Complete project overview
- [Engine Core Documentation](../../packages/engine-core/README.md) - Core engine APIs
- [Engine Excalibur Documentation](../../packages/engine-excalibur/README.md) - Web engine implementation
- [Message Channel Web Documentation](../../packages/message-channel-web/README.md) - Web messaging APIs

## 📄 License

This project is licensed under the MIT License - see the main [LICENSE](../../LICENSE) file for details. 