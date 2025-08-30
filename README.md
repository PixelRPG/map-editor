# PixelRPG Map Editor

A modern, cross-platform tile-based map editor for creating 2D RPG games, built with cutting-edge web technologies and native desktop integration. Combines the power of Excalibur.js game engine with GTK/Adwaita for a seamless development experience across web and desktop platforms.

## ✨ Features

- **Cross-Platform**: Native desktop app (GTK/GJS) and web browser support
- **Real-time Engine**: Live preview with Excalibur.js game engine integration
- **Tile-based Editing**: Intuitive tilemap creation and editing tools
- **Project Management**: Organized project structure with asset management
- **RPC Communication**: Bidirectional communication between UI and game engine
- **Type Safety**: Full TypeScript support for reliable development
- **Modern UI**: GTK 4 with Adwaita design language for desktop, responsive web interface
- **Live Development**: Hot-reload development workflow

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ with npm or yarn
- **For Desktop App**: GNOME development environment with GJS
- **For Web App**: Modern web browser with WebGL support

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Install dependencies
yarn install
```

### Launch Desktop Application

```bash
# Start the GJS/GTK desktop application
yarn workspace @pixelrpg/maker-gjs start
```

### Launch Web Application

```bash
# Start the web development server
yarn workspace @pixelrpg/maker-web dev
```

## 📁 Project Structure

```
pixelrpg-map-editor/
├── apps/
│   ├── maker-gjs/           # Primary GTK/GJS desktop application
│   ├── maker-web/           # Web browser version for testing
│   └── storybook-gjs/       # Component library and documentation
├── packages/
│   ├── engine-core/         # Core engine interfaces and types
│   ├── engine-excalibur/    # Web-based game engine implementation
│   ├── engine-gjs/          # GTK/GJS engine integration
│   ├── message-channel-core/# Core messaging infrastructure
│   ├── message-channel-gjs/ # GJS messaging implementation
│   ├── message-channel-web/ # Web messaging implementation
│   ├── message-channel-webview/ # WebView messaging implementation
│   ├── data-core/           # Core data structures and utilities
│   ├── data-gjs/            # GJS data layer implementation
│   ├── data-excalibur/      # Web data layer implementation
│   └── ui-gjs/              # GTK UI components
├── games/
│   └── zelda-like/          # Sample game project
└── docs/                    # Documentation and guides
```

## 🛠️ Development

### Development Workflow

```bash
# Install all dependencies
yarn install

# Start desktop development
yarn workspace @pixelrpg/maker-gjs dev

# Start web development
yarn workspace @pixelrpg/maker-web dev

# Build all packages
yarn build

# Run tests
yarn test

# Type checking
yarn type-check
```

### Development Commands

```bash
# Desktop Application
yarn workspace @pixelrpg/maker-gjs start    # Launch application
yarn workspace @pixelrpg/maker-gjs build   # Build for distribution

# Web Application
yarn workspace @pixelrpg/maker-web dev     # Development server
yarn workspace @pixelrpg/maker-web build   # Production build
yarn workspace @pixelrpg/maker-web preview # Preview production build

# Engine Packages
yarn workspace @pixelrpg/engine-excalibur dev    # Engine development
yarn workspace @pixelrpg/engine-excalibur build  # Engine build

# Utilities
yarn workspace @pixelrpg/storybook-gjs start     # Component documentation
```

## 🎮 Architecture

### Desktop Architecture (GJS/GTK)

```
┌─────────────────┐     RPC      ┌─────────────────┐
│   GTK UI        │◄──────────► │   WebKit        │
│   (Adwaita)     │             │   WebView       │
│                 │             │                 │
│ • Project View  │             │ • Excalibur.js  │
│ • Asset Browser │             │ • Game Canvas   │
│ • Property      │             │ • Live Preview  │
│   Inspector     │             │                 │
└─────────────────┘             └─────────────────┘
```

### Web Architecture

```
┌─────────────────┐     RPC      ┌─────────────────┐
│   Web UI        │◄──────────► │   iframe        │
│   (React/HTML)  │             │   WebView       │
│                 │             │                 │
│ • Project View  │             │ • Excalibur.js  │
│ • Asset Browser │             │ • Game Canvas   │
│ • Property      │             │ • Live Preview  │
│   Inspector     │             │                 │
└─────────────────┘             └─────────────────┘
```

## 📖 Usage Examples

### Creating a New Project

```typescript
import { Engine } from '@pixelrpg/engine-gjs';
import { RpcEngineType } from '@pixelrpg/engine-core';

// Create engine instance
const engine = new Engine();

// Initialize and load project
await engine.initialize();
await engine.loadProject('/path/to/project.json');

// Handle engine events
engine.connect(RpcEngineType.PROJECT_LOADED, (source, projectId) => {
  console.log('Project loaded:', projectId);
});
```

### Working with Maps

```typescript
// Load a specific map
await engine.loadMap('overworld');

// Start the game engine
await engine.start();

// Handle map events
engine.connect(RpcEngineType.MAP_LOADED, (source, mapId) => {
  console.log('Map loaded:', mapId);
});
```

## 🐛 Troubleshooting

### Common Issues

#### WebKit/WebView Issues

If you encounter WebKit-related errors:

```bash
# Check WebKit installation (Ubuntu/Debian)
sudo apt install webkit2gtk-4.1-dev

# For Fedora/CentOS
sudo dnf install webkitgtk4.1-devel
```

#### Permission Errors

If you see `bwrap: setting up uid map: Permission denied`:

```bash
# Solution for Ubuntu 24.04+
sudo systemctl enable --now systemd-userdbd
sudo loginctl enable-linger $USER
```

#### Build Errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules yarn.lock
yarn install

# Clear build cache
yarn workspace @pixelrpg/maker-gjs clean
yarn build
```

### Development Tips

- Use `yarn workspace <package> <command>` for package-specific operations
- Enable TypeScript strict mode for better development experience
- Use the Storybook for component development and testing
- Check the console for detailed error messages in WebKit WebView

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass: `yarn test`
6. Submit a pull request

### Development Guidelines

- Use TypeScript for all new code
- Follow the established project structure
- Add JSDoc comments for public APIs
- Write tests for new features
- Update documentation for API changes

## 📚 Documentation

- [Getting Started Guide](docs/getting-started.md)
- [API Reference](packages/engine-core/README.md)
- [Architecture Overview](docs/architecture.md)
- [Component Library](apps/storybook-gjs/README.md)

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run tests for specific package
yarn workspace @pixelrpg/engine-core test

# Run tests in watch mode
yarn test:watch
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Excalibur.js](https://excaliburjs.com/) - 2D game engine
- [GTK](https://gtk.org/) - GNOME UI toolkit
- [GJS](https://gjs.guide/) - JavaScript bindings for GNOME
- [WebKit](https://webkit.org/) - Web rendering engine

## 📞 Support

- [Issues](https://github.com/your-org/pixelrpg-map-editor/issues)
- [Discussions](https://github.com/your-org/pixelrpg-map-editor/discussions)
- [Documentation](https://your-org.github.io/pixelrpg-map-editor/)