# PixelRPG Map Editor

> A modern tile-based map editor for game development with cross-platform support for web and desktop environments.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![GNOME](https://img.shields.io/badge/GNOME-GJS-orange.svg)](https://gjs.guide/)
[![Excalibur](https://img.shields.io/badge/Excalibur-0.28+-green.svg)](https://excaliburjs.com/)

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

## 🎯 Overview

The PixelRPG Map Editor is a sophisticated tile-based game development tool that provides a seamless editing experience across multiple platforms. Built with modern web technologies and GNOME's GJS runtime, it offers powerful features for creating and editing game maps with support for multiple tilesets, layers, and real-time collaboration.

### Key Characteristics

- **Cross-Platform**: Works in web browsers and GNOME desktop environments
- **Real-Time Editing**: Immediate visual feedback during map editing
- **Multi-Tileset Support**: Handle complex tile collections with ease
- **Layer System**: Organize map elements with multiple rendering layers
- **Type-Safe**: Full TypeScript support with strict type checking
- **Extensible**: Plugin architecture for custom tools and features

## 🏗️ Architecture

The project follows a modular architecture with clear separation of concerns:

```
packages/
├── data-core/          # Platform-independent data structures
├── data-gjs/           # GNOME-specific data implementations
├── data-excalibur/     # Web/Excalibur data implementations
├── engine-core/        # Game engine interfaces
├── engine-gjs/         # GNOME engine implementation
├── engine-excalibur/   # Web engine implementation
├── message-channel-core/ # Communication interfaces
├── ui-gjs/             # GNOME UI components
└── story-gjs/          # Storybook integration
```

### Design Principles

- **Platform Independence**: Core packages remain runtime-agnostic
- **Interface Segregation**: Clean contracts between components
- **Type Safety**: Strict TypeScript usage throughout
- **Modular Design**: Clear boundaries between packages
- **Testability**: Isolated components with comprehensive testing

## ✨ Features

### Core Functionality
- ✅ **Tile Placement**: Click-to-place tiles with visual feedback
- ✅ **Multi-Tileset Support**: Handle unlimited tileset collections
- ✅ **Layer Management**: Organize content across multiple layers
- ✅ **Real-Time Rendering**: Immediate visual updates during editing
- ✅ **Cross-Platform**: Consistent experience on web and desktop

### Advanced Features
- 🔄 **Undo/Redo**: Full history management for all operations
- 🎨 **Visual Tools**: Brush, eraser, and selection tools
- 📊 **Performance**: Optimized rendering for large maps
- 🔧 **Extensible**: Plugin system for custom functionality
- 🌐 **Web Standards**: WHATWG-compliant message passing

### Developer Experience
- 📝 **TypeScript**: Full type safety and IntelliSense support
- 🧪 **Testing**: Comprehensive test coverage
- 📚 **Documentation**: Auto-generated API documentation
- 🎨 **Storybook**: Interactive component documentation
- 🐛 **Debugging**: Built-in development tools

## 🚀 Installation

### Prerequisites

- **Node.js**: Version 18.0 or higher
- **Yarn**: Version 4.0 or higher
- **GNOME**: For desktop development (optional)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Install dependencies
yarn install

# Build all packages
yarn build

# Start development server
yarn start
```

### Development Setup

```bash
# Install dependencies for all workspaces
yarn install

# Build core packages first
yarn workspace @pixelrpg/data-core run build
yarn workspace @pixelrpg/engine-core run build

# Start Storybook for component development
yarn workspace @pixelrpg/storybook-gjs run start
```

## 💡 Usage

### Basic Map Editing

```typescript
import { MapEditorService } from '@pixelrpg/engine-gjs'
import { MapData } from '@pixelrpg/data-core'

// Create map editor service
const editor = new MapEditorService()

// Load a map for editing
await editor.loadMap(mapData)

// Select a tile and place it
editor.selectTile(tileId)
editor.setActiveLayer(layerId)

// The editor provides real-time visual feedback
```

### Custom Tool Development

```typescript
import { BaseTool } from '@pixelrpg/engine-core'

class CustomBrushTool extends BaseTool {
  onTileClick(position: Vector): void {
    // Implement custom tile placement logic
    this.placeTileAt(position)
  }
}

// Register the tool
editor.registerTool('custom-brush', CustomBrushTool)
```

### Web Integration

```typescript
import { Engine } from '@pixelrpg/engine-excalibur'

// Initialize web-based editor
const engine = new Engine('canvas-element')
await engine.initialize()

// Load project and start editing
await engine.loadProject('./assets/project.json')
```

## 📖 API Documentation

### Core Interfaces

#### MapData
```typescript
interface MapData {
  id: string
  name?: string
  spriteSets: SpriteSetReference[]
  tileWidth: number
  tileHeight: number
  columns: number
  rows: number
  layers: LayerData[]
}
```

#### Engine Interface
```typescript
interface EngineInterface {
  status: EngineStatus
  loadProject(path: string): Promise<void>
  loadMap(mapId: string): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}
```

### Platform-Specific Implementations

#### GNOME Desktop
```typescript
import { Engine } from '@pixelrpg/engine-gjs'
const engine = new Engine()
```

#### Web Browser
```typescript
import { Engine } from '@pixelrpg/engine-excalibur'
const engine = new Engine('canvas-id')
```

## 🔧 Development

### Project Structure

```
pixelrpg-map-editor/
├── packages/           # Monorepo packages
│   ├── *-core/        # Platform-independent interfaces
│   ├── *-gjs/         # GNOME implementations
│   ├── *-excalibur/   # Web implementations
│   └── *-web/         # Web-specific utilities
├── apps/              # End-user applications
│   ├── maker-gjs/     # GNOME desktop app
│   ├── maker-web/     # Web application
│   └── cli/           # Command-line tools
├── games/             # Sample game projects
└── docs/              # Documentation
```

### Development Workflow

```bash
# Run tests across all packages
yarn test

# Build all packages
yarn build

# Start Storybook for component development
yarn workspace @pixelrpg/storybook-gjs run start

# Run type checking
yarn check

# Format code
yarn format
```

### Adding New Features

1. **Define Interface**: Add to appropriate `-core` package
2. **Implement Platform-Specific Code**: Update `-gjs` and `-excalibur` packages
3. **Add Tests**: Ensure comprehensive test coverage
4. **Update Documentation**: Keep API docs current
5. **Create Storybook Stories**: Document component usage

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Create a feature branch
git checkout -b feature/your-feature-name

# Make your changes and add tests
# Ensure all tests pass: yarn test

# Submit a pull request
```

### Code Standards

- **TypeScript**: Strict mode with no `any` types
- **Documentation**: JSDoc comments for all public APIs
- **Testing**: Unit tests for all new functionality
- **Linting**: ESLint configuration must pass
- **Commits**: Conventional commit format

### Architecture Guidelines

- Maintain platform independence in core packages
- Use feature detection over platform detection
- Implement comprehensive error handling
- Follow established patterns and conventions
- Keep interfaces clean and minimal

## 📄 License

This project is licensed under the GPL-3.0 License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- [Excalibur.js](https://excaliburjs.com/) - Game engine framework
- [GNOME](https://gnome.org/) - Desktop environment
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Blueprint](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/) - UI markup

---

**Built with ❤️ for game developers by the PixelRPG team**